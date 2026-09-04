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
 *   (map + area details; no Token, no rendered HTML, no tone, no DOM)
 * - `./semantic-construction.js` builds the domain model
 * - `./structural-check.js` owns structural validation (never semantic truth)
 * - `./inspector-projection.js` owns domain -> view projection (tone/HTML)
 * - `./handoff-context.js` / `./handoff-contract.js` own handoff
 *
 * Internal production code (especially `main.ts`) imports the focused
 * owners directly and must not route ordinary dependencies through this
 * facade.
 *
 * Contraction notes (removed canonical owners):
 * - Project Horizon / Stage Journey / Project Posture / Current Frontier /
 *   Strategic Threads / Recent Material Movement structured parsers and
 *   their guardrails were contracted away. Overview sections (situation /
 *   next / facing / recent) are plain-text sections, not structured
 *   sub-ontologies. Legacy rich headings resolve into the merged plain
 *   slot via `HEADING_ALIAS`.
 * - The SemanticRelation graph was removed; Inspector navigates
 *   overview → area → evidence only.
 * - Handoff owns project-context transport only. Execution Wave,
 *   admission, BASE, SEMANTIC_READY/PUBLISHABLE, JIT phases, freshness
 *   axes, WATCH_SURFACES, and publication race vocabulary were removed;
 *   execution mechanics defer to the repository's own development contract.
 */
// Markdown structural layer (Token mechanics stay here).
export { md, normalizeHeading, escapeHtml, renderTokens, withMermaidPlaceholders, splitSections, extractSectionRawText, } from "./markdown-structure.js";
// Deterministic authoring vocabulary (implementation of README §5).
export { HERE_MARKER, HEADING_ALIAS, normalizeKey, normalizeTitle, isCurrentStageHeading, isFoundationHeading, isFutureHeading, } from "./authoring-grammar.js";
// Semantic construction (clean; no HTML/tone).
export { parseListItems, parseProjectMap, parseAreaDetails, findAreaDetail, parseDocument, } from "./semantic-construction.js";
// Presentation/view derivation (sole owner of tone + HTML projection).
export { classifySubsectionTone, renderNativeMap, formatProjectMapText, formatAreaDetailsText, } from "./inspector-projection.js";
// Structural validation (structural only, never semantic truth).
export { checkProgressStructure, formatStructuralCheckReport, getAreaCompleteness, } from "./structural-check.js";
// Handoff siblings (canonical owners; parser only re-exports).
export { buildAreaHandoffContext, buildFocusHandoffContext, } from "./handoff-context.js";
export { formatAreaHandoffInstruction, formatFocusHandoffInstruction, } from "./handoff-contract.js";
