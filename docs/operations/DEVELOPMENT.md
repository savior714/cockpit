<!-- Language: en -->
# Development

This document owns the repository's **development execution contract**: how work is bounded, executed in a workspace, and closed/published. `docs/operations/TESTING.md` owns evidence semantics; this document does not restate them.

## 1. Before mutation

- Inspect the current repository state and the directly applicable authority before editing.
- If the prompt's premise conflicts with current evidence, follow `AGENTS.md` §2 mismatch investigation. If the mismatch remains material, stop mutation and report `EVIDENCE` vs `CONTRACT` with exact files/lines. Escalate only when the remaining premise decision is genuinely user-owned.
- Immediately before execution, re-read the relevant current truth; re-derive the task when a material premise (target ownership, contract, proof criterion) has changed. Unrelated upstream movement is information, not invalidation.

## 2. Work bounding

- Close one coherent bounded problem / safe state transition at a time.
- Keep strongly coupled changes together when they close one root cause; split independent state transitions apart.
- Do not absorb a newly discovered independent problem into the current task; report it instead.
- A proof-blocking adjacent defect may be repaired in-task only when bounded, mechanically understood, semantics-preserving, and necessary to exercise the claimed proof boundary. If it requires a new product decision or its root cause is uncertain, do not absorb it.
- No speculative abstraction, no unrelated cleanup, no manufactured follow-up work merely because improvement is possible.

### Complexity admission

> Add durable abstractions, frameworks, services, queues, registries, checkers, harnesses, or other machinery only when current evidence shows the actual problem cannot be safely closed through a simpler existing path and the added mechanism has a concrete expected benefit.

This is a decision criterion, not a scoring system, registry, or governance process. Prefer deletion and contraction over accumulation.

## 3. Workspace

Agent-mutable Git identity, worktree isolation, and publication safety are owned by the Bootstrap Git Safety Baseline (`./scripts/git-safety`, contract `bootstrap-git-safety/1`); this document owns only repository-specific semantic/proof classification on top of its verdicts. Mutations intended to become a candidate, commit, or publication start with `./scripts/git-safety create <task-id>` and work only in the admitted detached task-owned worktree it returns. Read-only/check/build/test verification does not require a task worktree. Explicitly local-only scratch edits may work in an already-isolated clean workspace when no candidate or commit is intended. A shared/user-owned canonical checkout is not made a mutation workspace merely because it is clean. No persistent task branch is needed merely to obtain isolation. Workspace mechanics are not semantic authority. Never reset, stash, clean, or overwrite state that another session or the user intends to preserve.

### BASE admission

- At task start, admit a fresh base through Git Safety (`./scripts/git-safety create <task-id>`) and record the BASE SHA it returns; the task starts from that fresh BASE in the admitted task-owned detached worktree. A mutation-intended task never implicitly inherits canonical-checkout dirty state or a stale worktree HEAD, so hash-object/update-index surgery to isolate unrelated WIP is not part of ordinary work.
- The canonical checkout is a user-owned reading/publishing point, not a task BASE. A task worktree that is behind `origin/main` is a stale base, not a publication candidate: re-base the work onto fresh main by preserving completed semantic work and reusable proof and performing only the minimal final binding required for publication (see §6), not by publishing the stale candidate and not as a from-scratch semantic restart.
- `dist/` is regenerated build output (`npm run build`). Never hand-merge `dist/*` hashed-asset churn across candidates; stale `dist/*` differences alone are mechanical staleness, never semantic overlap.

### Branch identity and closure

- Ordinary publication is direct to canonical `main` as an ordinary non-force fast-forward plus remote read-back (see §6). Do not create or push a remote task branch as part of ordinary publication. A local branch exists only when it carries identity needed beyond the task attempt (for example an explicit PR/review workflow that actually requires it); a remote task branch exists only while that explicit PR/review workflow actually requires it.
- A ref whose tip is a strict ancestor of fresh `origin/main` is stale/contained, never `DIVERGED`. Only neither-contains-the-other is `DIVERGED` (see §6; objective containment and fast-forward admissibility are owned by `./scripts/git-safety pre-publish <task-id>`, never by a local classifier).
- After `COMPLETE / PUBLISHED` (or an explicit terminal `COMPLETE / NO_CHANGE`, `COMPLETE / LOCAL_ONLY`, or a reported terminal disposition with its resume point recorded), the owning executor closes only its own admission with `./scripts/git-safety close <task-id>`, which removes only the admitted task-owned worktree after clean-state and containment verification and then only that admission record. Never remove foreign/user-owned state, a branch with unique unpublished commits, an open PR, or an active worktree on guess. When in doubt, leave the ref and report the residual.

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

Resolve objective Git identity, containment, and fast-forward admissibility through `./scripts/git-safety pre-publish <task-id>` for the admitted task candidate; do not reimplement that classification locally. `EXPECTED_BASE` is descriptive task context, not an authority input; its mismatch alone is never a reason to block, invalidate proof, or rematerialize. This section then classifies semantic impact, proof impact, and JIT meaning on top of the Git Safety verdict.

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

Fix/implement authorizes bounded local repository mutation and its required proof; it does not by itself authorize repository publication. Test/verify/review authorizes only the requested evidence or review activity and does not by itself authorize durable repository mutation or publication unless that authority is separately present in the current instruction. Only explicit repository publication intent (publish/push to `origin/main`) authorizes the ordinary non-force fast-forward publication path governed by this §6. Deployment, provider mutation, production action, release-side external mutation, or similar external side effects are distinct from repository publication; neither authority is inferred from the other. When the current instruction already carries repository publication intent, the ordinary publication governed by this §6 proceeds without an additional confirmation gate; destructive/history-rewriting Git and separate external side effects still require their own explicit authority.

For publication-intended work, when the current user instruction authorizes it and no local-only restriction exists:

- ordinary safe non-force fast-forward publication directly to canonical `main` plus remote read-back is part of normal closure; publication never creates or pushes a remote task branch by default;
- an unpublished local candidate is not the normal terminal success state.

### Distribution identity closure

The package's runtime identity is the `version` in `package.json`, and the
versioned GitHub installation authority is the immutable `v<version>` tag. The
existing distribution smoke test checks the packaged `package.json` version
against `cockpit --version`; it does not prove that a tag or remote points at
the same candidate. At a release boundary, run the same existing smoke test
with the opt-in identity proof enabled from a clean candidate tree:

```bash
COCKPIT_VERIFY_RELEASE_IDENTITY=1 npm test
```

This opt-in check derives the tag from `package.json` and proves, without a
second version source, that local `HEAD`, the local `v<version>` tag, and the
remote tag read-back resolve to the same commit. It is intentionally not part
of ordinary `npm test`, because the remote read-back is release-time evidence,
not a general test dependency. The installed tarball checks in the same smoke
test remain local artifact evidence; a tag-pinned GitHub install and any
installed-runtime recovery proof remain separate external release proof.

Canonical terminal outcomes:

- `COMPLETE / PUBLISHED` — the intended change is safely published and read back from the remote;
- `COMPLETE / NO_CHANGE` — proof shows no mutation was required; this is a legitimate terminal result;
- `COMPLETE / LOCAL_ONLY` — only when the task explicitly requested local-only work.

Local implementation/proof completion alone never closes a publication-intended task as `COMPLETE`. When the local semantic delta and its required proof are complete but remote publication/read-back remains, report `CONTINUABLE` with the local/publication distinction kept explicit; do not close as `COMPLETE / LOCAL_ONLY` merely because a local change exists. `COMPLETE / LOCAL_ONLY` stays allowed only when the task explicitly restricted the work to local-only.

Reporting shape only (not a new lifecycle state, enum, or schema):

  RESULT: CONTINUABLE
  LOCAL_CHANGE: COMPLETE
  PUBLICATION: PENDING
  RESUME_FROM: <exact next publication step>

If publication cannot safely complete, report `CONTINUABLE` or `BLOCKED` with the concrete cause and exact resume point. `CONTINUABLE` means topology-only staleness: the semantic result and reusable proof stand, and the exact resume point is the minimal final JIT topology binding plus directly affected proof under fresh remote authority — not a semantic restart. If another writer advances the remote again after final binding, the current publication attempt lost the race: preserve `SEMANTIC_READY`, reusable proof, and candidate/reference, end the attempt as `CONTINUABLE`, and do not repeat rematerialization inside the same attempt. `BLOCKED` means proven semantic-owner overlap, superseded meaning, or a safety invariant (unclear ownership, foreign dirty state, required authority missing): the candidate must not be rematerialized blindly. Destructive or history-rewriting Git operations, force pushes, and external side effects (deployment, provider mutations) require explicit user authority.

## 7. Concurrency

Concurrency is derived from independently convergent semantic ownership boundaries (§2), not from executor/session count. Do not manufacture N lanes to match N available executors. A good concurrent lane owns one coherent semantic outcome end to end; horizontal frontend/backend/tests/docs splitting is not the default decomposition when those layers implement one meaning. Fewer lanes are correct when the architecture exposes fewer independent boundaries.

Independent semantic work may proceed concurrently in independent task-owned detached worktrees admitted through Git Safety (§3). Work that shares a semantic owner or an overlapping mutation boundary must not be mutated in parallel; the same semantic surface stays with one owner at a time. The dirty canonical checkout is never the mechanism for sharing concurrent WIP.

### Transient ownership context

A task/handoff may carry, when useful, only the ownership/dependency context relevant to that task:

OWNERSHIP
- Semantic boundary:
- Intended outcome:
- Expected direct surfaces:
- Shared contracts expected to change:
- Dependencies:

This block is transient execution context. Expected direct surfaces are locators, not semantic authority and not a file lock. Do not persist it as a central registry/manifest, and do not add parsing, validation, schema, lifecycle state, or tooling for it.

### Boundary drift

When a lane discovers that another semantic boundary must change: continue work that remains independently valid inside the admitted boundary; do not silently absorb mutation of another active semantic owner; expose the newly discovered dependency; then, according to actual coupling, connect through an already-owned interface/contract, sequence the dependent work, or merge the work into one coherent semantic unit. A cross-file dependency alone is not `BLOCKED`, and work that can still validly continue outside the affected boundary keeps going.

### Concurrent runtime isolation

Automated concurrent local viewer/runtime proof should normally use the existing capability as:

  --port 0 --no-open

unless a fixed port or browser opening is itself required by the proof. Port `0` asks the OS for an assigned port and `serve.mjs` reports the actual bound port; `--no-open` suppresses opening a browser window per session. This avoids accidental TCP-port collision and repeated browser windows without adding any allocator, registry, lock service, runtime coordinator, or namespace framework.

### Integration-owned surfaces

Generated `dist/` output is not an independent semantic lane (§3): do not hand-merge hashed generated artifacts across independently completed source lanes; after source semantics converge, regenerate the integrated build output from that source state. Repository continuity/project documents stay continuity, not coordination: per §4, neither `PROGRESS.md` nor any repository document becomes a parallel-task manifest or batch task registry.

### Publication serialization

Final same-shared-ref publication remains a short serialization boundary under §6: fetch fresh immediately before publishing and publish one writer at a time; movement handling, proof scope, and retry/terminal vocabulary stay owned by §6 and Git Safety and are not reimplemented here. Add coordination machinery only after direct recurring evidence demonstrates that ordinary repository-native practice cannot preserve the required semantics at lower cost.
