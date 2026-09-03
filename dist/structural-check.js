/**
 * Structural validation owner: deterministic structural validity only.
 *
 * Owns `checkProgressStructure`, `StructuralCheckResult`, structural
 * guardrail evaluation, area/map completeness validation, and the human
 * structural check report formatting. Consumes the structural/domain
 * representation (`./markdown-structure.js`, `./semantic-construction.js`,
 * `./domain.js`) rather than becoming a second unrelated parser.
 *
 * Structural PASS retains its current meaning: headings, axis count/state,
 * Primary Frontier cardinality, relation targets, movement transitions,
 * Map ↔ Area Detail integrity, and Horizon telemetry hygiene. It never
 * checks semantic truth / RECONSTRUCT acceptance (external capable-agent
 * responsibility).
 */
import { md, normalizeHeading, parseHeadingBlocks, splitSections, } from "./markdown-structure.js";
import { isCurrentStageHeading, normalizeTitle } from "./authoring-grammar.js";
import { findAreaDetail, parseAreaDetails, parseMentalModel, parseProjectMap, } from "./semantic-construction.js";
function findTopLevelTelemetry(rawText) {
    const findings = [];
    if (/\b[0-9a-f]{40}\b/i.test(rawText))
        findings.push("a full Git SHA");
    if (/\bPID\s+\d+\b/i.test(rawText))
        findings.push("an explicit PID");
    if (/::test_[A-Za-z0-9_.-]+/.test(rawText))
        findings.push("a pytest-style test node");
    if (/(?:^|[\s(`])\/(?:Users|home|private|workspace|tmp|var)\/[^\s`)>]+/i.test(rawText)) {
        findings.push("an absolute implementation path");
    }
    return findings;
}
/** Deterministic structural completeness check across map items, area details, and current stage */
export function checkProgressStructure(markdownOrTokens) {
    const tokens = typeof markdownOrTokens === "string"
        ? md.parse(markdownOrTokens, {})
        : markdownOrTokens;
    const { sections } = splitSections(tokens);
    const mapTokens = sections.get("project map");
    const detailTokens = sections.get("area details");
    const hasProjectMap = Boolean(mapTokens && mapTokens.length > 0);
    const hasAreaDetails = Boolean(detailTokens && detailTokens.length > 0);
    const mentalModel = parseMentalModel(sections);
    const hasProjectHorizon = Boolean(sections.get("project horizon") && sections.get("project horizon").length > 0);
    const hasStageJourney = Boolean(sections.get("stage journey") && sections.get("stage journey").length > 0);
    const hasProjectPosture = Boolean(sections.get("project posture") && sections.get("project posture").length > 0);
    const hasStrategicThreads = Boolean(sections.get("strategic threads") && sections.get("strategic threads").length > 0);
    const hasMaterialMovement = Boolean(sections.get("recent material movement") &&
        sections.get("recent material movement").length > 0);
    // Count Current Focus H2 sections
    let currentFocusCount = 0;
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.level === 0 && t.type === "heading_open" && t.tag === "h2") {
            const headingToken = tokens[i + 1];
            if (headingToken && normalizeHeading([headingToken]) === "current focus") {
                currentFocusCount++;
            }
        }
    }
    const parsedMap = mapTokens
        ? parseProjectMap(mapTokens)
        : { isNativeMap: false, rails: [] };
    // Count Current Stage groups per rail and gather map items
    let currentStageCount = 0;
    const mapItemTitles = [];
    const mapItemKeyCounts = new Map();
    const multiStageRailErrors = [];
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
                multiStageRailErrors.push(`Multiple '현재 단계' (Current Stage) groups found in rail '${rail.title}' (${railStageCount}). At most 1 allowed per rail.`);
            }
        }
    }
    const totalMapItems = mapItemTitles.length;
    // Canonical Area Details (single owner) + structural duplicate detection.
    const areaDetails = detailTokens && detailTokens.length > 0 ? parseAreaDetails(detailTokens) : new Map();
    const duplicateDetails = [];
    if (detailTokens && detailTokens.length > 0) {
        const seenDetailKeys = new Set();
        for (const block of parseHeadingBlocks(detailTokens, "h3")) {
            const normKey = normalizeTitle(block.title);
            if (seenDetailKeys.has(normKey)) {
                duplicateDetails.push(block.title);
            }
            else {
                seenDetailKeys.add(normKey);
            }
        }
    }
    // Calculate missing items (map items without area detail)
    const missingTitles = [];
    let matchedDetails = 0;
    for (const title of mapItemTitles) {
        if (areaDetails.has(normalizeTitle(title))) {
            matchedDetails++;
        }
        else {
            missingTitles.push(title);
        }
    }
    const missingDetails = totalMapItems - matchedDetails;
    // Calculate orphan details (area details without matching map item)
    const orphanTitles = [];
    for (const [key, detail] of areaDetails.entries()) {
        if (!mapItemKeyCounts.has(key)) {
            orphanTitles.push(detail.title);
        }
    }
    const orphanDetails = orphanTitles.length;
    const postureAxes = mentalModel.posture?.axes ?? [];
    const frontiers = mentalModel.frontiers;
    const movements = mentalModel.movements;
    const primaryFrontiers = frontiers.filter((frontier) => frontier.isPrimary);
    const coPrimaryFrontiers = primaryFrontiers.filter((frontier) => frontier.isCoPrimary);
    const postureCoreCapabilityCount = postureAxes.filter((axis) => axis.role === "core-capability").length;
    const postureDeliveryReadinessCount = postureAxes.filter((axis) => axis.role === "delivery-readiness").length;
    const guardrailErrors = [];
    if (hasProjectHorizon) {
        const telemetry = findTopLevelTelemetry(mentalModel.horizon?.rawText ?? "");
        guardrailErrors.push(...telemetry.map((finding) => `Project Horizon contains ${finding}.`));
    }
    if (hasStageJourney) {
        if (!mentalModel.stageJourney || mentalModel.stageJourney.segments.length === 0) {
            guardrailErrors.push("Stage Journey must declare at least one stage segment.");
        }
        else {
            if (!mentalModel.stageJourney.currentStage) {
                guardrailErrors.push("Stage Journey must declare a '현재' (current) segment.");
            }
            if (!mentalModel.stageJourney.nextStage) {
                guardrailErrors.push("Stage Journey must declare a '다음' (next) segment.");
            }
            for (const segment of mentalModel.stageJourney.segments) {
                for (const gate of segment.gates) {
                    if (!gate.state) {
                        guardrailErrors.push(`Stage gate '${gate.title}' in '${segment.title}' is missing a declared state.`);
                    }
                }
            }
        }
    }
    if (hasProjectPosture) {
        if (postureAxes.length < 5 || postureAxes.length > 8) {
            guardrailErrors.push(`Project Posture must contain 5–8 axes; found ${postureAxes.length}.`);
        }
        if (postureCoreCapabilityCount === 0) {
            guardrailErrors.push("Project Posture must declare a Core Capability-equivalent axis or role.");
        }
        if (postureDeliveryReadinessCount === 0) {
            guardrailErrors.push("Project Posture must declare a Delivery/Stage Readiness-equivalent axis or role.");
        }
        for (const axis of postureAxes) {
            if (axis.state === null) {
                if (/^BLOCKED$/i.test(axis.declaredState)) {
                    guardrailErrors.push(`Posture axis '${axis.title}' encodes BLOCKED as maturity; use a separate Stage Blocker marker.`);
                }
                else {
                    guardrailErrors.push(`Posture axis '${axis.title}' must declare one of STRONG, PARTIAL, WEAK, or UNKNOWN.`);
                }
            }
        }
    }
    if (sections.get("current frontier") && sections.get("current frontier").length > 0) {
        if (primaryFrontiers.length === 0) {
            guardrailErrors.push("Current Frontier must declare one Primary Frontier.");
        }
        if (primaryFrontiers.length > 1 &&
            (coPrimaryFrontiers.length !== primaryFrontiers.length ||
                coPrimaryFrontiers.length < 2)) {
            guardrailErrors.push("Multiple Primary Frontiers require an explicit [CO-PRIMARY] marker on every primary entry.");
        }
        for (const frontier of frontiers) {
            if (!frontier.currentState || !frontier.targetState) {
                guardrailErrors.push(`Frontier '${frontier.title}' must declare a current and target state transition.`);
            }
        }
    }
    if (hasMaterialMovement) {
        if (movements.length === 0) {
            guardrailErrors.push("Recent Material Movement must contain at least one movement entry.");
        }
        for (const movement of movements) {
            if (!movement.hasStateTransition) {
                guardrailErrors.push(`Material movement '${movement.title}' must declare a before → after state transition.`);
            }
        }
    }
    const relationTargets = {
        area: new Set(mapItemTitles.map((title) => normalizeTitle(title))),
        stage: new Set(),
        posture: new Set(postureAxes.map((axis) => normalizeTitle(axis.title))),
        frontier: new Set(frontiers.map((frontier) => normalizeTitle(frontier.title))),
        movement: new Set(movements.map((movement) => normalizeTitle(movement.title))),
    };
    const stageJourney = mentalModel.stageJourney;
    if (stageJourney) {
        for (const segment of stageJourney.segments) {
            relationTargets.stage.add(normalizeTitle(segment.title));
            for (const gate of segment.gates) {
                relationTargets.stage.add(normalizeTitle(gate.title));
            }
        }
    }
    const unresolvedRelations = [];
    const validateRelations = (source, relations) => {
        for (const relation of relations) {
            if (!relationTargets[relation.kind].has(normalizeTitle(relation.target))) {
                unresolvedRelations.push(`${source} → ${relation.kind} '${relation.target}' does not resolve to a visible title.`);
            }
        }
    };
    for (const segment of stageJourney?.segments ?? []) {
        for (const gate of segment.gates)
            validateRelations(`Stage gate '${gate.title}'`, gate.relations);
    }
    for (const axis of postureAxes)
        validateRelations(`Posture '${axis.title}'`, axis.relations);
    for (const frontier of frontiers)
        validateRelations(`Frontier '${frontier.title}'`, frontier.relations);
    for (const thread of mentalModel.strategicThreads) {
        validateRelations(`Strategic Thread '${thread.title}'`, thread.relations);
    }
    for (const movement of movements)
        validateRelations(`Movement '${movement.title}'`, movement.relations);
    const errors = [];
    if (!hasProjectMap || !parsedMap.isNativeMap || totalMapItems === 0) {
        errors.push("Missing required '## 프로젝트 지도' (Project Map) surface or no map items found.");
    }
    if (!hasAreaDetails) {
        errors.push("Missing required '## 영역 상세' (Area Details) section.");
    }
    if (missingDetails > 0) {
        errors.push(`${missingDetails} map item(s) missing matching Area Detail.`);
    }
    if (orphanDetails > 0) {
        errors.push(`${orphanDetails} orphan Area Detail(s) without matching map item (title drift).`);
    }
    if (duplicateDetails.length > 0) {
        errors.push(`Duplicate Area Detail title(s) found: ${duplicateDetails.join(", ")}`);
    }
    if (currentFocusCount > 1) {
        errors.push(`Multiple '현재 집중' (Current Focus) sections found (${currentFocusCount}). At most 1 allowed.`);
    }
    for (const err of multiStageRailErrors) {
        errors.push(err);
    }
    errors.push(...guardrailErrors);
    errors.push(...unresolvedRelations);
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
        currentFocusCount,
        hasProjectMap,
        hasAreaDetails,
        hasProjectHorizon,
        hasStageJourney,
        hasProjectPosture,
        postureAxisCount: postureAxes.length,
        postureCoreCapabilityCount,
        postureDeliveryReadinessCount,
        primaryFrontierCount: primaryFrontiers.length,
        coPrimaryFrontierCount: coPrimaryFrontiers.length,
        hasStrategicThreads,
        hasMaterialMovement,
        materialMovementCount: movements.length,
        unresolvedRelations,
        guardrailErrors,
        errors,
    };
}
/** Format human-readable CLI report from check result */
export function formatStructuralCheckReport(result) {
    const lines = [];
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
    if (result.hasProjectHorizon || result.hasStageJourney || result.hasProjectPosture) {
        lines.push(`Horizon:          ${result.hasProjectHorizon ? "yes" : "no"}`);
        lines.push(`Stage Journey:    ${result.hasStageJourney ? "yes" : "no"}`);
        lines.push(`Posture axes:     ${result.postureAxisCount}`);
        lines.push(`Primary frontier: ${result.primaryFrontierCount}`);
        lines.push(`Material movement:${result.materialMovementCount}`);
    }
    if (result.unresolvedRelations.length > 0) {
        lines.push(`Relations:         ${result.unresolvedRelations.length} unresolved`);
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
        const nonMissingErrors = result.errors.filter((e) => !e.includes("missing matching Area Detail") &&
            !e.includes("orphan Area Detail") &&
            !e.includes("Duplicate Area Detail"));
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
export function getAreaCompleteness(parsedMap, areaDetails) {
    const missingTitles = [];
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
                    }
                    else {
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
