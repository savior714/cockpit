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

### BASE admission

- At task start, fetch fresh `origin/main` and record the BASE SHA the task actually starts from. A mutation-intended task starts from that fresh BASE in a task-owned worktree/branch; it never implicitly inherits canonical-checkout dirty state or a stale worktree HEAD.
- The canonical checkout is a user-owned reading/publishing point, not a task BASE. A task worktree that is behind `origin/main` is a stale base, not a publication candidate: re-base the work by reapplying the bounded semantic delta onto fresh main (see §6), not by publishing the stale candidate.
- `dist/` is regenerated build output (`npm run build`). Never hand-merge `dist/*` hashed-asset churn across candidates; stale `dist/*` differences alone are mechanical staleness, never semantic overlap.

### Worktree dependencies

- Fresh linked worktrees do not contain `node_modules`; this absence is normal because dependencies are untracked.
- When dependency manifests are identical between the task worktree and an already-prepared trusted workspace (such as the canonical checkout), temporary reuse of `node_modules` (e.g. via a local symlink) is permitted for bounded build, check, and test verification without running a redundant install.
- The baseline equality criterion requires that `package.json` and `package-lock.json` match identically between the task worktree and the reuse source (e.g. `cmp -s package.json <source>/package.json && cmp -s package-lock.json <source>/package-lock.json`).
- If manifests differ or dependency changes fall within the task's scope, never reuse dependencies; run `npm ci` directly in the task worktree.
- A temporary `node_modules` symlink is a disposable execution aid, never a repository artifact or publication candidate. Remove the symlink upon completing verification, or explicitly verify during final candidate integrity checks that it is neither tracked nor present in the untracked publication delta.
- Dependency reuse must never modify, clean, stash, or reset unrelated dirty state in the canonical checkout or reuse source.

## 4. Prompts and artifacts

Prompts are disposable execution artifacts, not canonical project state. Investigation scratch work stays temporary; promote only durable verified conclusions to their actual authority owner. Do not store task queues, receipts, or execution progress in repository documentation.

## 5. Proof and stopping

- Obtain proof proportional to the changed behavior, risk, and fan-out; `TESTING.md` owns what counts as faithful evidence.
- Stop when the done condition is proven. Do not append unrelated scans, suites, or governance after success.

## 6. Publication closure

Before publication, fetch fresh `origin/main` and classify intervening movement on three independent axes. Judge each axis separately; movement on one axis does not by itself invalidate the others.

- **Topological staleness** — whether the candidate is still a direct fast-forward descendant of current `origin/main`. A newer `origin/main` normally makes an old-parent candidate no longer directly publishable. That is normal Git cost, not a defect and not a semantic verdict.
- **Semantic overlap** — whether intervening changes alter the task's meaning, mutation ownership, or bounded outcome (same source hunks, same contract/test surface meaning, superseded fix). `dist/*` hashed-asset churn alone and same-file disjoint-hunk changes are not semantic overlap.
- **Proof boundary** — whether the criterion inputs and the identity-bearing proof owner (parser contract, fixture, build output) relevant to the claimed evidence materially moved. If only topology moved, prior semantic proof is preserved under its original run identity; rerun only the affected proof layer and candidate integrity checks bound to the new candidate.

When topology alone is stale and neither semantic overlap nor proof-boundary movement applies: preserve the prior semantic result, reapply only the bounded semantic delta onto fresh main in a fresh task-owned workspace, regenerate `dist/` via build, rerun the directly affected proof, then publish as an ordinary non-force fast-forward. Never force-push, and never merge/rebase/cherry-pick merely to preserve an old candidate SHA. The semantic delta matters; an old local commit identity does not.

For publication-intended work, when the current user instruction authorizes it and no local-only restriction exists:

- ordinary safe non-force fast-forward publication plus remote read-back is part of normal closure;
- an unpublished local candidate is not the normal terminal success state.

Canonical terminal outcomes:

- `COMPLETE / PUBLISHED` — the intended change is safely published and read back from the remote;
- `COMPLETE / NO_CHANGE` — proof shows no mutation was required; this is a legitimate terminal result;
- `COMPLETE / LOCAL_ONLY` — only when the task explicitly requested local-only work.

If publication cannot safely complete, report `CONTINUABLE` or `BLOCKED` with the concrete cause and exact resume point. `CONTINUABLE` means topology-only staleness: the semantic result stands and the exact resume point is reapplying the stated delta onto fresh main. `BLOCKED` means real semantic overlap, superseded meaning, or a safety invariant (unclear ownership, foreign dirty state, required authority missing): the candidate must not be rematerialized blindly. Destructive or history-rewriting Git operations, force pushes, and external side effects (deployment, provider mutations) require explicit user authority.

## 7. Concurrency

Independent work may proceed independently when mutation, authority, and evidence boundaries are independent. Publication is the short serialization boundary: fetch fresh immediately before publishing and publish one writer at a time; a second writer that arrives later classifies and rematerializes rather than racing. In this small single-surface repository, tasks touching the same source/test surface (`src/main.ts`, `src/parser.ts`, `src/style.css`, `index.html`, `tests/*`) default to serial framing, not parallel `NOW` execution. Add coordination machinery only after direct recurring evidence demonstrates that ordinary repository-native practice cannot preserve the required semantics at lower cost.
