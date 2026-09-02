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

Read only the owners directly relevant to the current task. Concrete commands are in §5 below and in `README.md` §6 (Korean).

## 3. Decision boundary

- The agent may decide ordinary technical implementation choices from repository evidence.
- Consequential product behavior, scope, acceptance meaning, or hard-to-reverse architecture remains a user decision unless already settled.
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
node --test tests/parser.test.mjs          # fast parser-only suite
npm run cockpit -- /path/to/PROGRESS.md    # run built viewer from dist/
node scripts/serve.mjs check [path]        # deterministic structural preflight, exit 0/1
```

- `scripts/serve.mjs` imports `../dist/parser.js`, not source. After any change to `src/parser.ts`, run `npm run build` before CLI/smoke verification; otherwise the CLI silently runs stale parser logic.
- `dist/` is committed to git. Regenerate and commit it together with source changes that affect build output.
- `tests/package-smoke.test.mjs` runs `npm pack` + isolated global install — slow and may need network. Scope tests to `parser.test.mjs` during iteration; run the full suite only as final proof.
- README §5 (Korean) is the authoring contract for `PROGRESS.md`; `src/parser.ts` is its canonical implementation. Section/heading semantics changes must land together across parser, `tests/fixtures/`, and README §5.
- Node engines: `^20.19.0 || >=22.12.0`.
