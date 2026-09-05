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
/** Format instruction block for Current Focus Problem Framer handoff */
export function formatFocusHandoffInstruction() {
    const lines = [
        "---",
        "[PROBLEM FRAMER HANDOFF INSTRUCTION]",
        "You received Cockpit project context for the current focus. The objective is to check that focus against fresh evidence and frame only the work the evidence actually requires.",
        ...SHARED_GUARDS,
    ];
    return lines.join("\n");
}
/** Format instruction block for Area Review Problem Framer handoff */
export function formatAreaHandoffInstruction() {
    const lines = [
        "---",
        "[PROBLEM FRAMER HANDOFF INSTRUCTION]",
        "You received Cockpit project context for one selected area. The objective is to review that area against fresh evidence and frame only the work the evidence actually requires.",
        "Analyze the area's current state deeply against the source evidence in the area details; identify actual problems, causes, and unfinished boundaries in concrete product terms instead of generalities.",
        ...SHARED_GUARDS,
    ];
    return lines.join("\n");
}
