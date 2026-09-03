/**
 * Compatibility/public API facade (thin).
 *
 * `dist/parser.js` is consumed by the CLI (`scripts/serve.mjs`), tests, and
 * packaged installs, so this module remains as the public entrypoint. It
 * contains no canonical domain model definitions, no parsing algorithms, no
 * structural checker implementation, no UI renderer, and no handoff
 * implementation — only imports/re-exports from the focused sole owners:
 *
 * - README §5 owns the human authoring contract
 * - `./authoring-grammar.js` implements the deterministic vocabulary
 * - `./markdown-structure.js` owns markdown-it Token mechanics
 * - `./domain.js` owns the clean presentation-free semantic model
 *   (no Token, no rendered HTML, no tone, no DOM)
 * - `./semantic-construction.js` builds the domain model
 * - `./structural-check.js` owns structural validation (never semantic truth)
 * - `./inspector-projection.js` owns domain -> view projection (tone/HTML)
 * - `./handoff-context.js` / `./handoff-contract.js` own handoff
 *
 * Internal production code (especially `main.ts`) imports the focused
 * owners directly and must not route ordinary dependencies through this
 * facade.
 *
 * Compatibility notes (documented adapters/removals):
 * - Legacy `ParsedMap.rawTokens` (Token leak) is replaced by clean
 *   `ParsedMap.fallbackText` (plain text). `formatProjectMapText` preserves
 *   the non-native fallback behavior via that string.
 * - Legacy `MapItem.rawHtml` was dead (no reader/test consumer) and is
 *   removed; card rendering uses title/description via projection.
 * - Legacy `html`/`tone` fields on domain subsections/entities were
 *   presentation contamination. The clean domain carries `rawText`;
 *   HTML/tone derivation lives in `./inspector-projection.js`
 *   (`toViewSubsection`, `classifySubsectionTone`, `renderMarkdownString`).
 *   This facade re-exports the projection-owned `SemanticTone` and
 *   `classifySubsectionTone` so existing `dist/parser.js` importers keep
 *   resolving them.
 */
// Markdown structural layer (Token mechanics stay here).
export { md, normalizeHeading, escapeHtml, renderTokens, withMermaidPlaceholders, splitSections, extractSectionRawText, } from "./markdown-structure.js";
// Deterministic authoring vocabulary (implementation of README §5).
export { HERE_MARKER, HEADING_ALIAS, normalizeKey, normalizeTitle, isCurrentStageHeading, isFoundationHeading, isFutureHeading, } from "./authoring-grammar.js";
// Semantic construction (clean; no HTML/tone).
export { parseListItems, parseProjectMap, parseAreaDetails, findAreaDetail, parseProjectHorizon, parseStageJourney, parseProjectPosture, parseCurrentFrontiers, parseStrategicThreads, parseMaterialMovements, parseMentalModel, parseDocument, } from "./semantic-construction.js";
// Presentation/view derivation (sole owner of tone + HTML projection).
export { classifySubsectionTone, renderNativeMap, formatProjectMapText, formatAreaDetailsText, } from "./inspector-projection.js";
// Structural validation (structural only, never semantic truth).
export { checkProgressStructure, formatStructuralCheckReport, getAreaCompleteness, } from "./structural-check.js";
// Handoff siblings (canonical owners; parser only re-exports).
export { buildAreaHandoffContext, buildFocusHandoffContext, } from "./handoff-context.js";
export { formatAdmissionPublicationContractLines, formatAreaHandoffInstruction, formatExecutionWaveContractLines, formatFocusHandoffInstruction, } from "./handoff-contract.js";
