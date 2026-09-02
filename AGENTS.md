# AGENTS.md — repository agent kernel

<!-- Language: en -->

This file owns only the small precedence, routing, and decision-boundary rules every agent in this repository must know. Detailed development and evidence rules live with their subject owners; do not duplicate them here.

## 1. Precedence

Instruction precedence for the current task:

1. the user's current instruction;
2. this `AGENTS.md`;
3. the subject-specific owner documents routed from here;
4. current code/test/config/runtime evidence.

Tiers 1–3 are instructions; tier 4 is implementation evidence. When current evidence and an active contract differ, investigate the mismatch rather than silently rewriting either side.

## 2. Authority routing

| Question | Owner |
|---|---|
| Development decomposition, execution boundary, workspace, publication closure | `docs/operations/DEVELOPMENT.md` |
| Evidence / validation semantics | `docs/operations/TESTING.md` |
| Actual implementation state | code, tests, config, runtime evidence |

Read only the owners directly relevant to the current task. Project-specific build/test/run instructions are added later from actual chosen implementation evidence; until they exist, derive commands from the repository itself.

## 3. Decision boundary

- The agent may decide ordinary technical implementation choices from repository evidence.
- Consequential product behavior, scope, acceptance meaning, or hard-to-reverse architecture remains a user decision unless already settled.
- Close one bounded failure domain / coherent state transition at a time; do not absorb newly discovered independent problems into the current task.

## 4. Execution

Ordinary repository-native execution is canonical. Do not introduce runners, daemons, queues, schedulers, persistent work/task state, admission protocols, or other execution-lifecycle machinery. Detailed execution and publication semantics are owned by `docs/operations/DEVELOPMENT.md`; evidence semantics by `docs/operations/TESTING.md`.
