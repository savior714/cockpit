<!-- Language: en -->
# Development

This document owns the repository's **development execution contract**: how work is bounded, executed in a workspace, and closed/published. `docs/operations/TESTING.md` owns evidence semantics; this document does not restate them.

## 1. Before mutation

- Inspect the current repository state and the directly applicable authority before editing.
- If the prompt's premise conflicts with current evidence, investigate the mismatch rather than forcing the requested patch.
- Immediately before execution, re-read the relevant current truth; re-derive the task when a material premise (target ownership, contract, proof criterion) has changed. Unrelated upstream movement is information, not invalidation.

## 2. Work bounding

- Close one coherent bounded problem / safe state transition at a time.
- Keep strongly coupled changes together when they close one root cause; split independent state transitions apart.
- Do not absorb a newly discovered independent problem into the current task; report it instead.
- No speculative abstraction, no unrelated cleanup, no manufactured follow-up work merely because improvement is possible.

### Complexity admission

> Add durable abstractions, frameworks, services, queues, registries, checkers, harnesses, or other machinery only when current evidence shows the actual problem cannot be safely closed through a simpler existing path and the added mechanism has a concrete expected benefit.

This is a decision criterion, not a scoring system, registry, or governance process. Prefer deletion and contraction over accumulation.

## 3. Workspace

Use the simplest safe workspace. The current checkout is fine when ownership and dirty state make it safe; a branch or worktree is an optional implementation choice when isolation materially improves safety. Workspace mechanics are not semantic authority. Never reset, stash, clean, or overwrite state that another session or the user intends to preserve.

## 4. Prompts and artifacts

Prompts are disposable execution artifacts, not canonical project state. Investigation scratch work stays temporary; promote only durable verified conclusions to their actual authority owner. Do not store task queues, receipts, or execution progress in repository documentation.

## 5. Proof and stopping

- Obtain proof proportional to the changed behavior, risk, and fan-out; `TESTING.md` owns what counts as faithful evidence.
- Stop when the done condition is proven. Do not append unrelated scans, suites, or governance after success.

## 6. Publication closure

Before publication, fetch fresh upstream state and determine whether intervening changes materially affect the task. Overlapping semantic movement requires re-checking meaning and proof before proceeding; unrelated movement does not.

For publication-intended work, when the current user instruction authorizes it and no local-only restriction exists:

- ordinary safe non-force fast-forward publication plus remote read-back is part of normal closure;
- an unpublished local candidate is not the normal terminal success state.

Canonical terminal outcomes:

- `COMPLETE / PUBLISHED` — the intended change is safely published and read back from the remote;
- `COMPLETE / NO_CHANGE` — proof shows no mutation was required; this is a legitimate terminal result;
- `COMPLETE / LOCAL_ONLY` — only when the task explicitly requested local-only work.

If publication cannot safely complete, report `CONTINUABLE` or `BLOCKED` with the concrete cause and exact resume point. Destructive or history-rewriting Git operations, force pushes, and external side effects (deployment, provider mutations) require explicit user authority.

## 7. Concurrency

Independent work may proceed independently when mutation, authority, and evidence boundaries are independent. Add coordination machinery only after direct recurring evidence demonstrates that ordinary repository-native practice cannot preserve the required semantics at lower cost.
