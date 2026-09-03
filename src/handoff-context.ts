/**
 * Deterministic Problem Framer handoff context assembly.
 *
 * Pure string-assembly implementation extracted from src/parser.ts as a
 * behavior-preserving bounded refactor. Canonical instruction wording stays
 * owned by src/handoff-contract.ts; this module only assembles the
 * deterministic context payload and appends the canonical instruction block.
 * src/parser.ts remains the public compatibility facade and re-exports the
 * four public symbols; import from "./parser" preserves existing callers.
 */

import {
  formatAreaHandoffInstruction,
  formatFocusHandoffInstruction,
} from "./handoff-contract.js";
import type { AreaDetail } from "./parser.js";

export interface FocusHandoffParams {
  projectTitle: string;
  focusText: string;
  situationText?: string;
  nextTransitionText?: string;
  facingIssuesText?: string;
  projectFrameText?: string;
  settledDirectionText?: string;
  projectMapText?: string;
  areaDetailsText?: string;
}

export interface AreaHandoffParams {
  projectTitle: string;
  areaTitle: string;
  railTitle?: string;
  groupTitle?: string;
  areaDescription?: string;
  areaDetail?: AreaDetail | null;
  focusText?: string;
  situationText?: string;
  nextTransitionText?: string;
  facingIssuesText?: string;
  projectFrameText?: string;
  settledDirectionText?: string;
}

/** Build deterministic plain-text context for external Problem Framer handoff (Current Focus) */
export function buildFocusHandoffContext(params: FocusHandoffParams): string {
  const sections: string[] = [];

  sections.push(`[PROJECT]\n${params.projectTitle || "Cockpit"}`);
  sections.push(`[CURRENT FOCUS]\n${params.focusText.trim()}`);

  if (params.situationText && params.situationText.trim()) {
    sections.push(`[CURRENT SITUATION]\n${params.situationText.trim()}`);
  }

  if (params.nextTransitionText && params.nextTransitionText.trim()) {
    sections.push(`[NEXT TRANSITION]\n${params.nextTransitionText.trim()}`);
  }

  if (params.facingIssuesText && params.facingIssuesText.trim()) {
    sections.push(`[FACING ISSUES]\n${params.facingIssuesText.trim()}`);
  }

  if (params.projectFrameText && params.projectFrameText.trim()) {
    sections.push(`[PROJECT FRAME]\n${params.projectFrameText.trim()}`);
  }

  if (params.settledDirectionText && params.settledDirectionText.trim()) {
    sections.push(`[SETTLED DIRECTION]\n${params.settledDirectionText.trim()}`);
  }

  if (params.projectMapText && params.projectMapText.trim()) {
    sections.push(`[PROJECT MAP]\n${params.projectMapText.trim()}`);
  }

  if (params.areaDetailsText && params.areaDetailsText.trim()) {
    sections.push(`[AREA CONTEXT]\n${params.areaDetailsText.trim()}`);
  }

  sections.push(formatFocusHandoffInstruction());

  return sections.join("\n\n");
}

/** Build deterministic plain-text context for external Problem Framer handoff (Selected Area Review) */
export function buildAreaHandoffContext(params: AreaHandoffParams): string {
  const sections: string[] = [];

  sections.push(`[PROJECT]\n${params.projectTitle || "Cockpit"}`);

  const tagParts = [params.railTitle, params.groupTitle].filter(Boolean);
  const areaHeader = tagParts.length > 0
    ? `${params.areaTitle} (${tagParts.join(" · ")})`
    : params.areaTitle;
  sections.push(`[SELECTED AREA]\n${areaHeader}`);

  if (params.areaDescription && params.areaDescription.trim()) {
    sections.push(`[AREA SUMMARY]\n${params.areaDescription.trim()}`);
  }

  if (params.areaDetail && params.areaDetail.subsections.length > 0) {
    const detailLines: string[] = [];
    for (const sub of params.areaDetail.subsections) {
      detailLines.push(`#### ${sub.subheading}`);
      detailLines.push(sub.rawText.trim());
    }
    sections.push(`[AREA DETAILS]\n${detailLines.join("\n")}`);
  }

  if (params.focusText && params.focusText.trim()) {
    sections.push(`[CURRENT FOCUS]\n${params.focusText.trim()}`);
  }

  if (params.situationText && params.situationText.trim()) {
    sections.push(`[CURRENT SITUATION]\n${params.situationText.trim()}`);
  }

  if (params.nextTransitionText && params.nextTransitionText.trim()) {
    sections.push(`[NEXT TRANSITION]\n${params.nextTransitionText.trim()}`);
  }

  if (params.facingIssuesText && params.facingIssuesText.trim()) {
    sections.push(`[FACING ISSUES]\n${params.facingIssuesText.trim()}`);
  }

  if (params.projectFrameText && params.projectFrameText.trim()) {
    sections.push(`[PROJECT FRAME]\n${params.projectFrameText.trim()}`);
  }

  if (params.settledDirectionText && params.settledDirectionText.trim()) {
    sections.push(`[SETTLED DIRECTION]\n${params.settledDirectionText.trim()}`);
  }

  sections.push(formatAreaHandoffInstruction());

  return sections.join("\n\n");
}
