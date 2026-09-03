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
- The canonical checkout is a user-owned reading/publishing point, not a task BASE. A task worktree that is behind `origin/main` is a stale base, not a publication candidate: re-base the work onto fresh main by preserving completed semantic work and reusable proof and performing only the minimal final binding required for publication (see §6), not by publishing the stale candidate and not as a from-scratch semantic restart.
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

Before the three-axis classification, resolve identity and containment first, in this order. Identity decides before topology.

Resolve the publication relation from direct Git identity/containment authority (`rev-parse` plus `merge-base --is-ancestor`) over the candidate and fresh `origin/main`. `EXPECTED_BASE` is descriptive task context, not an authority input; its mismatch alone is never a reason to block, invalidate proof, or rematerialize.

- Fresh `origin/main` equals the candidate: the intended change is already `COMPLETE / PUBLISHED`. Do not republish, rematerialize, or rerun proof.
- Fresh `origin/main` equals the candidate's expected base: no topology advance yet. Continue to the three-axis eligibility evaluation below.
- Fresh `origin/main` is a strict ancestor of the candidate: the candidate remains a direct fast-forward descendant and is `PUBLISHABLE` once candidate-bound integrity/direct-impact proof passes. Do not block or rematerialize because `EXPECTED_BASE` is stale; perform the final fresh-authority check, ordinary non-force push, and remote read-back.
- Fresh is neither the expected base nor the candidate, and neither contains the other: real intervening movement exists. Classify with the existing topology / semantic-overlap / proof-boundary rules as `CONTINUABLE` or `BLOCKED`.
- The candidate is a strict ancestor of fresh `origin/main`: do not stop at merely published and do not rematerialize on topology alone. Confirm under the existing semantic-overlap judgment whether the candidate's meaning stands incorporated in later history or was reverted, superseded, or overlapped, then close within the existing `COMPLETE / PUBLISHED`, `CONTINUABLE`, `BLOCKED` vocabulary.

`SEMANTIC_READY` means the bounded semantic delta, admitted-base context, proof owner/criterion, and proof result are known in the transient handoff; it does not create durable task state or by itself authorize publication. `PUBLISHABLE` additionally requires fresh remote authority proving the candidate is a fast-forward descendant of current `origin/main`, candidate integrity/direct-impact proof, and an immediate ordinary non-force publication path. `SEMANTIC_READY != PUBLISHABLE`.

JIT binding carries an explicit transient `bindingPhase`: `PRE_FINAL_JIT` or `POST_FINAL_JIT`. The caller must provide this value; there is no implicit `PRE_FINAL_JIT` default and it is not persistent task state. Apply identity/containment before any phase-specific second-advance rule: if fresh `origin/main` is already a strict ancestor of the candidate, the existing candidate remains fast-forward-publishable and is not treated as a second-advance race. Only a real divergent relation enters the phase-specific movement rules:

- `PRE_FINAL_JIT` plus topology-only divergent movement, with no semantic overlap and no proof-boundary movement, is `TOPOLOGY_REBIND_ELIGIBLE`.
- `POST_FINAL_JIT` plus a new divergent remote advance is `SECOND_ADVANCE_CIRCUIT_BREAKER`: `rebindAllowed: false`, the current candidate is `REFERENCE_ONLY`, and the current publication attempt ends as a lost race. The semantic delta and existing proof remain available as transient evidence; this verdict does not delete semantic work, broadly invalidate proof, or create persistent blocked state. The next publication attempt starts with fresh authority and classification.

Bind publication-intended candidate identity as late as practical, after fresh remote authority is known. For topology-only movement, preserve the semantic delta and reusable proof and materialize only the minimum final child needed on fresh main, ideally once per successful publication attempt; if fresh `origin/main` is already a strict ancestor of the candidate, publish that existing candidate instead of rematerializing it. When intervening movement actually changes the semantic owner that determines the task's meaning, use `READMIT` / `BLOCKED` rather than blind salvage. When only a proof owner or criterion moved while the task meaning stands, preserve the semantic delta but prohibit stale proof/JIT reuse and return `PROOF_BOUNDARY_REFRESH_REQUIRED` with `jitBindingReusable: false`, `semanticDeltaPreserved: true`, and `proofAction: DIRECTLY_AFFECTED_TARGETED_REFRESH`; proof-owner-only movement is never combined with semantic overlap into a single `BLOCKED` verdict. When the impact is uncertain, reduce it first with bounded read-only classification and the nearest targeted proof; `UNKNOWN` never promotes to `BLOCKED` or a full rebuild.

- **Topological staleness** — whether the candidate is still a direct fast-forward descendant of current `origin/main`. A newer `origin/main` normally makes an old-parent candidate no longer directly publishable. That is normal Git cost, not a defect and not a semantic verdict.
- **Semantic overlap** — whether intervening changes alter the task's meaning, mutation ownership, or bounded outcome (same source hunks, same contract/test surface meaning, superseded fix). `dist/*` hashed-asset churn alone and same-file disjoint-hunk changes are not semantic overlap.
- **Proof boundary** — whether the criterion inputs and the identity-bearing proof owner (parser contract, fixture, build output) relevant to the claimed evidence materially moved. If only topology moved, prior semantic proof is preserved under its original run identity; rerun only the affected proof layer and candidate integrity checks bound to the new candidate. If only a proof owner/criterion moved, preserve the semantic delta, reject stale proof/JIT reuse, and run `DIRECTLY_AFFECTED_TARGETED_REFRESH`; broad proof is required only when the movement actually invalidates that broad criterion.

When topology alone is stale and neither semantic-owner nor proof-owner movement applies: preserve the prior semantic result, reusable proof, and candidate/reference, perform only the minimal final JIT topology binding needed for publication on fresh main (regenerate `dist/` via build), rerun only the directly affected integrity/proof, then publish as an ordinary non-force fast-forward. Never treat reapplying the same semantic delta from scratch on fresh main as unconditional remediation for topology movement. Never force-push, and never merge/rebase/cherry-pick merely to preserve an old candidate SHA. The semantic delta matters; an old local commit identity does not.

For publication-intended work, when the current user instruction authorizes it and no local-only restriction exists:

- ordinary safe non-force fast-forward publication plus remote read-back is part of normal closure;
- an unpublished local candidate is not the normal terminal success state.

Canonical terminal outcomes:

- `COMPLETE / PUBLISHED` — the intended change is safely published and read back from the remote;
- `COMPLETE / NO_CHANGE` — proof shows no mutation was required; this is a legitimate terminal result;
- `COMPLETE / LOCAL_ONLY` — only when the task explicitly requested local-only work.

If publication cannot safely complete, report `CONTINUABLE` or `BLOCKED` with the concrete cause and exact resume point. `CONTINUABLE` means topology-only staleness: the semantic result and reusable proof stand, and the exact resume point is the minimal final JIT topology binding plus directly affected proof under fresh remote authority — not a semantic restart. If another writer advances the remote again after final binding, the current publication attempt lost the race: preserve `SEMANTIC_READY`, reusable proof, and candidate/reference, end the attempt as `CONTINUABLE`, and do not repeat rematerialization inside the same attempt. `BLOCKED` means proven semantic-owner overlap, superseded meaning, or a safety invariant (unclear ownership, foreign dirty state, required authority missing): the candidate must not be rematerialized blindly. Destructive or history-rewriting Git operations, force pushes, and external side effects (deployment, provider mutations) require explicit user authority.

## 7. Concurrency

Independent work may proceed independently when mutation, authority, and evidence boundaries are independent. Publication is the short serialization boundary: fetch fresh immediately before publishing and publish one writer at a time; topology-only movement before final JIT may rebind once, while a new divergent advance after final JIT is `SECOND_ADVANCE_CIRCUIT_BREAKER` for that attempt, with no same-attempt rematerialization loop. The next attempt starts with fresh classification. In this small single-surface repository, tasks touching the same source/test surface (`src/main.ts`, `src/parser.ts`, `src/style.css`, `index.html`, `tests/*`) default to serial framing, not parallel `NOW` execution. Add coordination machinery only after direct recurring evidence demonstrates that ordinary repository-native practice cannot preserve the required semantics at lower cost.
