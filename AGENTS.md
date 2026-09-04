# AGENTS.md — repository agent kernel

<!-- Language: en -->

This file owns only the small precedence, routing, and decision-boundary rules every agent in this repository must know. Detailed development and evidence rules live with their subject owners; do not duplicate them here.

## 1. Precedence

Instruction precedence for the current task:

1. the user's current instruction;
2. this `AGENTS.md`;
3. the subject-specific owner documents routed from here;
4. current code/test/config/runtime evidence.

Tiers 1–3 are instructions; tier 4 is implementation evidence. When current evidence and an active contract differ, investigate the mismatch under the §2 expansion boundary rather than silently rewriting either side.

## 2. Authority routing

| Question | Owner |
|---|---|
| Development decomposition, execution boundary, workspace, publication closure | `docs/operations/DEVELOPMENT.md` |
| Evidence / validation semantics | `docs/operations/TESTING.md` |
| Reader-facing language / product vocabulary | `README.md` §5 `독자용 표시 언어` |
| Actual implementation state | code, tests, config, runtime evidence |

Read the routed owner plus the exact claimed boundary. Expand one dependency/authority hop at a time only while a material CONFLICTED/UNKNOWN blocks the decision. Stop when resolved. Record exact owner/path with line-level pointers for conflict/boundary/review findings. Concrete commands are in §5 below and in `README.md` §6 (Korean).

## 3. Decision boundary

- Ordinary technical choices include file-local naming, test wording, semantics-preserving refactor, proof-mechanism choice, settled-UX detail, and small non-meaning copy/layout; the agent may decide them from repository evidence.
- Consequential choices include user-visible behavior/meaning, workflow/acceptance, public API/contract, safety/security/privacy/data, irreversible migration/data loss, cross-boundary scope, and promise-changing copy; they remain a user decision unless already settled.
- Already settled means the `README.md` §5 table, `SETTLED` framing, or explicit instruction; escalate once at the decision point, and downstream must not re-ask.
- Close one bounded failure domain / coherent state transition at a time; do not absorb newly discovered independent problems into the current task.
- When Cockpit is being accepted against an external repository, target-project findings are testbed evidence rather than Cockpit work; do not remediate them unless the user explicitly switches the goal back to target-project development. The detailed boundary is in `README.md` §4.

## 4. Execution

Ordinary repository-native execution is canonical. Do not introduce runners, daemons, queues, schedulers, persistent work/task state, admission protocols, or other execution-lifecycle machinery. Detailed execution and publication semantics are owned by `docs/operations/DEVELOPMENT.md`; evidence semantics by `docs/operations/TESTING.md`.

## 5. Commands and build facts

Cockpit is a read-only local viewer for one `PROGRESS.md`: Vite/TypeScript frontend (`src/main.ts`) plus loopback CLI server (`scripts/serve.mjs`). This repo dogfoods itself — the root `PROGRESS.md` is its own progress file in the format it renders.

```bash
npm run dev        # Vite dev server (serves /src/main.ts directly)
npm run build      # tsc --noEmit && vite build && separate tsc emit of dist/parser.js
npm test           # node --test tests/*.test.mjs (no test framework)
node --test tests/structural-check.test.mjs   # fast structural-check-only suite
npm run cockpit -- /path/to/PROGRESS.md    # run built viewer from dist/
node scripts/serve.mjs check [path]        # deterministic structural preflight, exit 0/1
```

- `scripts/serve.mjs` imports `../dist/parser.js`, not source. After any change to `src/*.ts` that affects build output, run `npm run build` before CLI/smoke verification; otherwise the CLI silently runs stale parser logic.
- `dist/` is committed to git. Regenerate and commit it together with source changes that affect build output.
- `tests/package-smoke.test.mjs` runs `npm pack` + isolated global install — slow and may need network. Scope tests to the directly affected owner suite during iteration; run the full suite only as final proof.
- README §5 (Korean) owns the human authoring contract for `PROGRESS.md`. Focused implementation modules implement syntax/domain/check/projection responsibilities (`authoring-grammar` / `markdown-structure` / `domain` / `semantic-construction` / `structural-check` / `inspector-projection`); `src/parser.ts` / `dist/parser.js` is a compatibility/public facade. Section/heading semantics changes must land together across implementation, `tests/fixtures/`, owner suites, and README §5.
- Node engines: `^20.19.0 || >=22.12.0`.
