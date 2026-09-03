<!-- Language: en -->
# Testing and validation

This document owns the repository's durable **evidence semantics**: what counts as proof for a claim. It does not record test inventories, counts, or transient pass/fail state. Actual commands live in the repository's own scripts/config once they exist.

## 1. Evidence must match the claim

- Every claim requires evidence at the exact boundary and scope being claimed. A lower-level or adjacent proof does not become a higher-level proof by accumulation.
- `PASS`/`DONE` wording, green summaries, badges, test names, or command names are not evidence. Evidence is the concrete observation: executed output, diff, response, rendered state.
- Agreement among components that derive their truth from the same assumption (code + its mock, fixture + its parser) proves internal consistency only, not the external fact.

## 2. Proportionate proof

- Choose the smallest faithful proof layer that detects the changed behavior; add a new test only when existing coverage would actually miss the changed invariant.
- Escalate breadth only when fan-out is genuinely broad (shared config, lockfile/dependency change, shared interface, runtime lifecycle).
- A proof-owner/criterion-only movement preserves the semantic delta but forbids stale proof or JIT reuse: rerun only the directly affected targeted proof layer. Restart a broad suite only when the movement actually invalidates that broad criterion; this refresh is evidence maintenance, not automatic publication proof.
- Do not run unrelated broad suites for reassurance. Once adequate proof for the criterion exists, stop; do not bolt on unrelated validation machinery.

## 3. No contract weakening

- Do not weaken, skip, or reinterpret a contract/spec/assertion merely to make a check green.
- Fix the failing failure domain; do not manufacture success through skips, fallbacks, sleeps that mask races, or loosened assertions.
- A failure must remain a failure in its carrier: do not encode errors as success-shaped results (empty/default payload, swallowed exception behind `ok`) and rely on downstream code to rediscover them.

## 4. Existence is not capability

- Code, configuration, dependency-injection wiring, or the presence of a credential does not prove a live external capability.
- Distinguish `UNKNOWN` / `NOT RUN` / `SKIPPED` / `NOT PROVEN` from healthy/successful. Missing observation never defaults to success; a summary status must not collapse an unproven dimension behind one green result.
- An unused configuration value, a test-only construction path, or an unreachable safer implementation proves nothing about production behavior.

## 5. External boundaries and rendered behavior

- When a claim involves an external integration (API, service, provider), the claim requires evidence at that actual boundary — real request/response or authoritative state — under the current official contract, when such a claim is made.
- For uncertain external-write outcomes, establish authoritative reconciliation before blind retry.
- UI behavior claims should observe representative rendered behavior (not only code inspection or unit-level surrogates) when the claim concerns what the user actually sees or does.
