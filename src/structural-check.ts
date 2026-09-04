/**
 * Structural validation owner: deterministic structural validity only.
 *
 * Owns `checkProgressStructure`, `StructuralCheckResult`, structural
 * guardrail evaluation, area/map completeness validation, and the human
 * structural check report formatting. Consumes the structural/domain
 * representation (`./markdown-structure.js`, `./semantic-construction.js`,
 * `./domain.js`) rather than becoming a second unrelated parser.
 *
 * Structural PASS means: required map + area details exist, every map item
 * resolves to exactly one area detail (no missing/orphan/duplicates), at
 * most one Current Stage (YOU ARE HERE) group per map rail, at most one Current Focus, and
 * overview sections stay free of low-level telemetry dumps. It never
 * checks semantic truth (external-agent responsibility).
 *
 * There is intentionally no Stage/Posture/Frontier/Thread/Movement/relation
 * ontology here: those canonical owners were contracted away. Unknown H2
 * sections render as secondary extra context and never fail the check.
 */

import type { Token } from "./markdown-structure.js";
import {
  extractSectionRawText,
  md,
  parseHeadingBlocks,
  splitSections,
} from "./markdown-structure.js";
import { isCurrentStageHeading, normalizeTitle } from "./authoring-grammar.js";
import {
  findAreaDetail,
  parseAreaDetails,
  parseProjectMap,
} from "./semantic-construction.js";
import type {
  AreaDetail,
  ParsedMap,
} from "./domain.js";

export interface AreaCompleteness {
  totalItems: number;
  matchedItems: number;
  missingItems: number;
  missingTitles: string[];
}

export interface StructuralCheckResult {
  ok: boolean;
  totalMapItems: number;
  matchedDetails: number;
  missingDetails: number;
  missingTitles: string[];
  orphanDetails: number;
  orphanTitles: string[];
  duplicateDetails: string[];
  currentStageCount: number;
  currentFocusCount: number;
  hasProjectMap: boolean;
  hasAreaDetails: boolean;
  hasSituation: boolean;
  hasNext: boolean;
  hasFacing: boolean;
  hasRecent: boolean;
  guardrailErrors: string[];
  errors: string[];
}

function findTopLevelTelemetry(rawText: string): string[] {
  const findings: string[] = [];
  if (/\b[0-9a-f]{40}\b/i.test(rawText)) findings.push("a full Git SHA");
  if (/\bPID\s+\d+\b/i.test(rawText)) findings.push("an explicit PID");
  if (/::test_[A-Za-z0-9_.-]+/.test(rawText)) findings.push("a pytest-style test node");
  if (/(?:^|[\s(`])\/(?:Users|home|private|workspace|tmp|var)\/[^\s`)>]+/i.test(rawText)) {
    findings.push("an absolute implementation path");
  }
  return findings;
}

/** Deterministic structural completeness check across map items, area details, and current stage */
export function checkProgressStructure(
  markdownOrTokens: string | Token[]
): StructuralCheckResult {
  const tokens =
    typeof markdownOrTokens === "string"
      ? md.parse(markdownOrTokens, {})
      : markdownOrTokens;

  const { sections } = splitSections(tokens);

  const mapTokens = sections.get("project map");
  const detailTokens = sections.get("area details");

  const hasProjectMap = Boolean(mapTokens && mapTokens.length > 0);
  const hasAreaDetails = Boolean(detailTokens && detailTokens.length > 0);
  const hasSituation = Boolean(sections.get("situation")?.length);
  const hasNext = Boolean(sections.get("next")?.length);
  const hasFacing = Boolean(sections.get("facing")?.length);
  const hasRecent = Boolean(sections.get("recent")?.length);

  const parsedMap = mapTokens
    ? parseProjectMap(mapTokens)
    : { isNativeMap: false, rails: [] as ParsedMap["rails"] };

  // Count Current Stage groups per rail and gather map items
  let currentStageCount = 0;
  const mapItemTitles: string[] = [];
  const mapItemKeyCounts = new Map<string, number>();
  const multiStageRailErrors: string[] = [];

  if (parsedMap.rails) {
    for (const rail of parsedMap.rails) {
      let railStageCount = 0;
      for (const group of rail.groups) {
        if (isCurrentStageHeading(group.title)) {
          currentStageCount++;
          railStageCount++;
        }
        for (const item of group.items) {
          mapItemTitles.push(item.title);
          const key = normalizeTitle(item.title);
          mapItemKeyCounts.set(key, (mapItemKeyCounts.get(key) ?? 0) + 1);
        }
      }
      if (railStageCount > 1) {
        multiStageRailErrors.push(
          `Multiple '현재 단계' (Current Stage) groups found in rail '${rail.title}' (${railStageCount}). At most 1 allowed per rail.`
        );
      }
    }
  }

  const totalMapItems = mapItemTitles.length;

  // Canonical Area Details (single owner) + structural duplicate detection.
  const areaDetails: Map<string, AreaDetail> =
    detailTokens && detailTokens.length > 0 ? parseAreaDetails(detailTokens) : new Map();
  const duplicateDetails: string[] = [];
  if (detailTokens && detailTokens.length > 0) {
    const seenDetailKeys = new Set<string>();
    for (const block of parseHeadingBlocks(detailTokens, "h3")) {
      const normKey = normalizeTitle(block.title);
      if (seenDetailKeys.has(normKey)) {
        duplicateDetails.push(block.title);
      } else {
        seenDetailKeys.add(normKey);
      }
    }
  }

  // Calculate missing items (map items without area detail)
  const missingTitles: string[] = [];
  let matchedDetails = 0;
  for (const title of mapItemTitles) {
    if (areaDetails.has(normalizeTitle(title))) {
      matchedDetails++;
    } else {
      missingTitles.push(title);
    }
  }
  const missingDetails = totalMapItems - matchedDetails;

  // Calculate orphan details (area details without matching map item)
  const orphanTitles: string[] = [];
  for (const [key, detail] of areaDetails.entries()) {
    if (!mapItemKeyCounts.has(key)) {
      orphanTitles.push(detail.title);
    }
  }
  const orphanDetails = orphanTitles.length;

  const guardrailErrors: string[] = [];
  // Overview hygiene: situation / next / facing stay readable orientation,
  // not low-level telemetry dumps. Exact evidence lives in area details.
  for (const key of ["situation", "next", "facing"] as const) {
    const rawText = extractSectionRawText(sections.get(key));
    if (!rawText) continue;
    const telemetry = findTopLevelTelemetry(rawText);
    const label = key === "situation" ? "현재 상황" : key === "next" ? "다음 전환" : "막힘";
    guardrailErrors.push(...telemetry.map((finding) => `${label} contains ${finding}.`));
  }

  // Count focus sections via normalized H2 keys (splitSections already maps aliases).
  const focusCount = countFocusSections(tokens);

  const errors: string[] = [];

  if (!hasProjectMap || !parsedMap.isNativeMap || totalMapItems === 0) {
    errors.push(
      "Missing required '## 프로젝트 지도' (Project Map) surface or no map items found."
    );
  }
  if (!hasAreaDetails) {
    errors.push("Missing required '## 영역 상세' (Area Details) section.");
  }
  if (missingDetails > 0) {
    errors.push(`${missingDetails} map item(s) missing matching Area Detail.`);
  }
  if (orphanDetails > 0) {
    errors.push(
      `${orphanDetails} orphan Area Detail(s) without matching map item (title drift).`
    );
  }
  if (duplicateDetails.length > 0) {
    errors.push(
      `Duplicate Area Detail title(s) found: ${duplicateDetails.join(", ")}`
    );
  }
  if (focusCount > 1) {
    errors.push(
      `Multiple '현재 집중' (Current Focus) sections found (${focusCount}). At most 1 allowed.`
    );
  }
  for (const err of multiStageRailErrors) {
    errors.push(err);
  }
  errors.push(...guardrailErrors);

  const ok = errors.length === 0;

  return {
    ok,
    totalMapItems,
    matchedDetails,
    missingDetails,
    missingTitles,
    orphanDetails,
    orphanTitles,
    duplicateDetails,
    currentStageCount,
    currentFocusCount: focusCount,
    hasProjectMap,
    hasAreaDetails,
    hasSituation,
    hasNext,
    hasFacing,
    hasRecent,
    guardrailErrors,
    errors,
  };
}

function countFocusSections(tokens: Token[]): number {
  // Focus aliases ("현재 집중", "current focus", ...) map to one slot;
  // recount H2s directly so duplicates fail instead of merging silently.
  let count = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.level === 0 && t.type === "heading_open" && t.tag === "h2") {
      const inline = tokens[i + 1];
      const raw = (inline?.content ?? "").trim().toLowerCase().replace(/\s+/g, " ");
      if (
        raw === "현재 집중" ||
        raw === "현재의 집중" ||
        raw === "current focus" ||
        raw === "focus"
      ) {
        count++;
      }
    }
  }
  return count;
}

/** Format human-readable CLI report from check result */
export function formatStructuralCheckReport(
  result: StructuralCheckResult
): string {
  const lines: string[] = [];
  lines.push(`PROGRESS structural check: ${result.ok ? "PASS" : "FAIL"}`);
  lines.push("");
  lines.push(`Map items:       ${result.totalMapItems}`);
  lines.push(`Area details:    ${result.matchedDetails}`);
  if (result.missingDetails > 0) {
    lines.push(`Missing details: ${result.missingDetails}`);
  }
  if (result.orphanDetails > 0) {
    lines.push(`Orphan details:  ${result.orphanDetails}`);
  }
  if (result.duplicateDetails.length > 0) {
    lines.push(`Duplicates:      ${result.duplicateDetails.length}`);
  }
  lines.push(`Current stage:   ${result.currentStageCount}`);
  if (result.currentFocusCount > 0) {
    lines.push(`Current focus:   ${result.currentFocusCount}`);
  }
  if (result.hasSituation || result.hasNext || result.hasFacing || result.hasRecent) {
    lines.push(`Now:              ${result.hasSituation ? "yes" : "no"}`);
    lines.push(`Next:             ${result.hasNext ? "yes" : "no"}`);
    lines.push(`Blocked:          ${result.hasFacing ? "yes" : "no"}`);
    lines.push(`Recent:           ${result.hasRecent ? "yes" : "no"}`);
  }
  lines.push("");

  if (result.missingTitles.length > 0) {
    lines.push("Missing:");
    for (const title of result.missingTitles) {
      lines.push(`- ${title}`);
    }
    lines.push("");
  }

  if (result.orphanTitles.length > 0) {
    lines.push("Orphan details (no matching map item):");
    for (const title of result.orphanTitles) {
      lines.push(`- ${title}`);
    }
    lines.push("");
  }

  if (result.duplicateDetails.length > 0) {
    lines.push("Duplicate Area Detail titles:");
    for (const title of result.duplicateDetails) {
      lines.push(`- ${title}`);
    }
    lines.push("");
  }

  if (result.errors.length > 0 && !result.ok) {
    const nonMissingErrors = result.errors.filter(
      (e) =>
        !e.includes("missing matching Area Detail") &&
        !e.includes("orphan Area Detail") &&
        !e.includes("Duplicate Area Detail")
    );
    if (nonMissingErrors.length > 0) {
      lines.push("Errors:");
      for (const err of nonMissingErrors) {
        lines.push(`- ${err}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd();
}

/** Calculate structural area-detail completeness across all inspectable map items */
export function getAreaCompleteness(
  parsedMap: ParsedMap,
  areaDetails: Map<string, AreaDetail>
): AreaCompleteness {
  const missingTitles: string[] = [];
  let totalItems = 0;
  let matchedItems = 0;

  if (parsedMap && parsedMap.rails) {
    for (const rail of parsedMap.rails) {
      for (const group of rail.groups) {
        for (const item of group.items) {
          totalItems++;
          const detail = findAreaDetail(item, areaDetails);
          if (detail) {
            matchedItems++;
          } else {
            missingTitles.push(item.title);
          }
        }
      }
    }
  }

  return {
    totalItems,
    matchedItems,
    missingItems: totalItems - matchedItems,
    missingTitles,
  };
}
