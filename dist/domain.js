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
export {};
