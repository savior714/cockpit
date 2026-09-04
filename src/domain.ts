/**
 * Canonical Cockpit internal semantic/domain model.
 *
 * Sole owner for the deterministic document model derived from a single
 * PROGRESS.md. This module is presentation-free by construction:
 * it must not import markdown-it Token, rendered HTML, CSS/display tone,
 * or DOM-oriented data.
 *
 * Canonical concepts (one owner per reader question):
 * - Project Map: what the project is made of + where the current position is
 * - Area Detail: what an area means, its current level, and its evidence
 * - Overview sections (focus / situation / next / facing / recent /
 *   frame / settled) are plain-text sections owned by the Markdown
 *   structural layer, not structured sub-ontologies. There is exactly one
 *   owner per question: no Horizon-vs-Situation, Frontier-vs-Next, or
 *   Movement-vs-Recent dual canonical models, and no Stage/Posture/Thread
 *   gate or maturity ontology.
 */

export interface MapItem {
  id: string;
  title: string;
  description: string;
  railTitle: string;
  groupTitle: string;
  isCurrentStage?: boolean;
}

export interface MapGroup {
  title: string;
  isOrdered?: boolean;
  items: MapItem[];
}

export interface MapRail {
  title: string;
  railType: "trajectory" | "neutral";
  groups: MapGroup[];
}

export interface ParsedMap {
  isNativeMap: boolean;
  rails: MapRail[];
  hasCurrentStage?: boolean;
  /** Plain-text fallback for non-native maps. */
  fallbackText?: string;
}

export interface AreaDetailSubsection {
  subheading: string;
  rawText: string;
}

export interface AreaDetail {
  title: string;
  normalizedKey: string;
  subsections: AreaDetailSubsection[];
  summaryText?: string;
}

/** Root Cockpit document model: title + map + area details. */
export interface ParsedDocument {
  title: string;
  map: ParsedMap;
  areaDetails: Map<string, AreaDetail>;
}
