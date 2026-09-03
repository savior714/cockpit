/**
 * Canonical Cockpit internal semantic/domain model.
 *
 * Sole owner for the deterministic document model derived from a single
 * PROGRESS.md. This module is presentation-free by construction:
 * it must not import markdown-it Token, rendered HTML, CSS/display tone,
 * or DOM-oriented data.
 *
 * - `rawText` is authoring plain-text (for text projection/handoff),
 *   not rendered HTML.
 * - `summaryText` is a deterministic plain-text lead sentence, not HTML.
 * - View concerns (HTML rendering, SemanticTone, Inspector view-model)
 *   live in `./inspector-projection.js`.
 * - Legacy presentation-contaminated shapes (html/tone/rawTokens/rawHtml)
 *   are preserved only as documented compatibility adapters in the
 *   projection/facade boundary, never as dependencies of new internal code.
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
  /** Plain-text fallback for non-native maps (replaces legacy rawTokens). */
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

export type MaturityState = "STRONG" | "PARTIAL" | "WEAK" | "UNKNOWN";

export type SemanticRelationKind =
  | "area"
  | "stage"
  | "posture"
  | "frontier"
  | "movement";

export interface SemanticRelation {
  kind: SemanticRelationKind;
  target: string;
}

export interface SemanticSubsection {
  subheading: string;
  rawText: string;
}

export interface ProjectHorizon {
  title: string;
  rawText: string;
  summaryText: string;
  isLegacyFallback: boolean;
}

export interface StageGate {
  title: string;
  state: string;
  summaryText: string;
  entryCondition?: string;
  decisionReason?: string;
  rawText: string;
  subsections: SemanticSubsection[];
  relations: SemanticRelation[];
  isStageBlocker: boolean;
}

export interface StageSegment {
  role: "current" | "next" | "other";
  title: string;
  rawText: string;
  gates: StageGate[];
}

export interface StageJourney {
  segments: StageSegment[];
  currentStage?: string;
  nextStage?: string;
  currentGates: StageGate[];
  nextGates: StageGate[];
  rawText: string;
}

export type PostureRole = "core-capability" | "delivery-readiness" | undefined;

export interface PostureAxis {
  title: string;
  state: MaturityState | null;
  declaredState: string;
  role: PostureRole;
  summaryText: string;
  rawText: string;
  subsections: SemanticSubsection[];
  relations: SemanticRelation[];
  isStageBlocker: boolean;
}

export interface ProjectPosture {
  axes: PostureAxis[];
  rawText: string;
}

export interface Frontier {
  title: string;
  currentState: string;
  targetState: string;
  whyNow: string;
  successMeaning: string;
  stageImpact: string;
  closedBoundaries: string;
  evidence: string;
  summaryText: string;
  rawText: string;
  subsections: SemanticSubsection[];
  relations: SemanticRelation[];
  isPrimary: boolean;
  isCoPrimary: boolean;
}

export interface StrategicThread {
  title: string;
  state: string;
  summaryText: string;
  rawText: string;
  subsections: SemanticSubsection[];
  relations: SemanticRelation[];
}

export interface MaterialMovement {
  title: string;
  before: string;
  change: string;
  after: string;
  summaryText: string;
  rawText: string;
  subsections: SemanticSubsection[];
  relations: SemanticRelation[];
  hasStateTransition: boolean;
}

export interface ParsedMentalModel {
  horizon?: ProjectHorizon;
  stageJourney?: StageJourney;
  posture?: ProjectPosture;
  frontiers: Frontier[];
  strategicThreads: StrategicThread[];
  movements: MaterialMovement[];
}

/** Root Cockpit document model: title + structural sections + semantic model. */
export interface ParsedDocument {
  title: string;
  map: ParsedMap;
  areaDetails: Map<string, AreaDetail>;
  model: ParsedMentalModel;
}
