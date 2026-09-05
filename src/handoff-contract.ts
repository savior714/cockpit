/**
 * Canonical Problem Framer handoff instruction contract.
 *
 * Sole owner for canonical handoff wording. Consumed by
 * `./handoff-context.js` (context assembly) and re-exported by the
 * compatibility facade (`./parser.js`); internal production code imports
 * this focused owner directly.
 *
 * Cockpit handoff carries project context only: title, goal, settled
 * direction, map, selected area or focus, current situation, next
 * transition, material blockers, area detail, and evidence text.
 * Execution, scheduling, admission, publication, freshness, topology, and
 * Git mechanics belong to the repository's own development contract
 * (`docs/operations/DEVELOPMENT.md`); this module duplicates none of them
 * and owns no Execution Wave / BASE / JIT / freshness vocabulary.
 */

const SHARED_GUARDS = [
  "1. [Fresh evidence first] Do not trust the handed-over PROGRESS claims as truth. Re-check them against current repository / runtime evidence before acting.",
  "2. [No manufactured work] If there is no real, evidence-backed problem in scope, finish with NO_ACTION / NO_CHANGE instead of inventing tasks.",
  "3. [Closed claims stay closed] Do not resurrect closed or obsolete claims as new tasks. A claim already closed by current evidence is information, not work.",
  "4. [Repository owns execution] For how to run, schedule, publish, or handle Git safety in this repository, follow the repository's own current development / Git safety contract. This handoff defines no execution, scheduling, admission, publication, freshness, or topology semantics.",
  "5. [No persistence] This handoff is transient context transport. Store nothing as a task registry, queue, status, assignment, or claim database in Cockpit or PROGRESS.md.",
];

const AREA_DEEP_REVIEW = [
  "Deeply investigate THIS selected area. Do not summarize the handed-over text; reconstruct its CURRENT REALITY from fresh evidence.",
  "1. Treat the handed-over PROGRESS text as context, not truth.",
  "2. Reconstruct the selected area's CURRENT REALITY from fresh repository / runtime / docs / tests evidence.",
  "3. Name the concrete product objects and user/developer workflows this area actually owns.",
  "4. Separate what is implemented, what is proven by fresh evidence, what is merely claimed, and what remains unknown.",
  "5. Inspect the important interfaces, boundaries, and dependencies with neighboring areas when they can change the diagnosis.",
  "6. Find concrete unfinished boundaries, contradictions, regressions, missing proof, unsafe assumptions, or obsolete claims.",
  "7. Do not manufacture work and do not reopen genuinely closed work.",
  "8. Distinguish evidence-backed findings from inference in every claim.",
  "9. Converge into: CURRENT REALITY / FRESH EVIDENCE / MATERIAL GAPS / RISKS / DECISION NEEDED (only when a real semantic or product choice exists) / BOUNDED NEXT WORK, or NO_ACTION / NO_CHANGE when no evidence-backed work exists.",
  "10. When bounded implementation work is justified, emit the normal Problem Framer execution contract under the repository's own current development / runtime authority. This handoff embeds no execution mechanics.",
];

/** Format instruction block for Current Focus Problem Framer handoff */
export function formatFocusHandoffInstruction(): string {
  const lines: string[] = [
    "---",
    "[PROBLEM FRAMER HANDOFF INSTRUCTION]",
    "You received Cockpit project context for the current focus. The objective is to check that focus against fresh evidence and frame only the work the evidence actually requires.",
    ...SHARED_GUARDS,
  ];
  return lines.join("\n");
}

/** Format instruction block for Area Review Problem Framer handoff */
export function formatAreaHandoffInstruction(): string {
  const lines: string[] = [
    "---",
    "[PROBLEM FRAMER HANDOFF INSTRUCTION]",
    "You received Cockpit project context for one selected area. Deeply investigate THIS area against fresh evidence and frame only the work the evidence actually requires.",
    ...SHARED_GUARDS,
    ...AREA_DEEP_REVIEW,
  ];
  return lines.join("\n");
}
