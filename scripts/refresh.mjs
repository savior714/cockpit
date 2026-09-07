#!/usr/bin/env node
// Cockpit optional refresh orchestration: the single small boundary that owns
// the opt-in automatic PROGRESS refresh cadence.
//
// What this module owns:
//   - one runtime-owned scheduler (10-minute cadence, single timer per process)
//   - invoking the canonical LLM author capability once per tick
//   - read-back of the target PROGRESS.md and before/after comparison
//   - non-destructive status reporting (never writes PROGRESS.md itself)
//   - keeping the Git-local storage disposition stable after author
//     success via scripts/git-local-exclude.mjs (warning-only,
//     never before success, never flipping it)
//
// What this module explicitly does NOT own:
//   - repository / project semantics analysis
//   - PROGRESS.md content generation or conservative-PATCH decisions
//   - file watching / live reload (owned by serve.mjs SSE path)
//   - browser timers or localStorage (the server is the sole scheduler owner)
//
// The LLM author (COCKPIT_AUTHOR_COMMAND, legacy fallback
// COCKPIT_REFRESH_COMMAND — one capability, not two) is owned outside
// Cockpit. Existing-document ticks invoke it as AUTHOR_MODE=refresh: it must
// reconcile fresh evidence with the existing document delta-first and PATCH
// only material semantic deltas. When it is not configured, refresh ticks
// are a no-op that preserve the current document and screen.
// Bootstrap (missing PROGRESS.md) uses the same author capability via
// scripts/author.mjs with AUTHOR_MODE=bootstrap; this module never duplicates
// that execution mechanism and never widens into a repository analyzer.
//
// Lifecycle (last-viewer shutdown):
//   - the cadence timer is unref'd, so it never keeps the Node process alive
//     by itself; the viewer lifecycle in serve.mjs (active SSE viewers +
//     short idle grace) remains the sole owner of process exit.
//   - dispose() clears the timer and terminates any in-flight author child
//     so shutdown never leaks a detached background process.
//   - activation is defined: enabling arms the timer; the first author
//     invocation happens on the next cadence tick, never immediately and
//     never from the browser.

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  DEFAULT_REFRESH_TIMEOUT_MS as CANONICAL_REFRESH_TIMEOUT_MS,
  REFRESH_MODE,
  resolveAuthorCommand,
  resolveRefreshTimeoutMs as resolveCanonicalRefreshTimeoutMs,
  runAuthorCommand,
} from "./author.mjs";
import { saveRecoveryReplica as defaultSaveRecoveryReplica } from "./replica.mjs";
import { ensureManagedStorage as defaultEnsureManagedStorage } from "./git-local-exclude.mjs";

export const DEFAULT_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
// Refresh timeout default stays bounded (5 minutes). The canonical value
// lives in scripts/author.mjs alongside the bootstrap budget; this alias
// preserves the existing import surface.
export const DEFAULT_REFRESH_TIMEOUT_MS = CANONICAL_REFRESH_TIMEOUT_MS;

function parsePositiveInt(raw, fallback) {
  const n = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isSafeInteger(n) || n <= 0) return fallback;
  return n;
}

export function resolveRefreshIntervalMs(env = process.env) {
  return parsePositiveInt(env?.COCKPIT_REFRESH_INTERVAL_MS, DEFAULT_REFRESH_INTERVAL_MS);
}

// Canonical author command (COCKPIT_AUTHOR_COMMAND, legacy fallback
// COCKPIT_REFRESH_COMMAND). resolveRefreshCommand is the legacy name for the
// same single capability — not an independent executor.
export function resolveRefreshCommand(env = process.env) {
  return resolveAuthorCommand(env);
}

export { resolveAuthorCommand };

export function resolveRefreshTimeoutMs(env = process.env) {
  // Single timeout owner lives in scripts/author.mjs: refresh-specific
  // override first, generic COCKPIT_AUTHOR_TIMEOUT_MS fallback, 5-minute
  // bounded default. Never the bootstrap budget.
  return resolveCanonicalRefreshTimeoutMs(env);
}

function hashBuffer(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

async function readSnapshot(file, readFileFn = readFile) {
  const buf = await readFileFn(file);
  const content = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf), "utf-8");
  return { bytes: content, hash: hashBuffer(content) };
}

export function createDefaultExecRefresh({ progressFile, projectDir, childRef } = {}) {
  return async () => {
    // Single author execution mechanism (shared with bootstrap): no second
    // shell path lives here. Existing-document invocation always authors as
    // AUTHOR_MODE=refresh (delta-first, bounded budget).
    const result = await runAuthorCommand({
      projectDir: projectDir ?? path.dirname(progressFile),
      progressFile,
      mode: REFRESH_MODE,
      onSpawn: (child) => {
        if (childRef && typeof childRef === "object") childRef.current = child;
      },
    });
    if (childRef && typeof childRef === "object") childRef.current = null;
    if (result.outcome === "not-configured") return { outcome: "not-configured" };
    if (result.outcome === "failed") return { outcome: "failed", error: result.error };
    return { outcome: "executed" };
  };
}

/**
 * Single runtime-owned refresh orchestrator. One instance per server process.
 * Multi-tab safety comes from this singularity: tabs only reflect server
 * status over SSE and never schedule refresh themselves.
 */
export function createRefreshOrchestrator({
  progressFile,
  projectDir,
  intervalMs = resolveRefreshIntervalMs(),
  execRefresh,
  onStatus,
  readFileFn = readFile,
  nowFn = () => new Date().toISOString(),
  saveReplicaFn,
  ensureStorageFn,
} = {}) {
  if (!progressFile) throw new Error("createRefreshOrchestrator requires progressFile");
  const resolvedProjectDir = projectDir ?? path.dirname(progressFile);
  const cadenceMs = parsePositiveInt(intervalMs, DEFAULT_REFRESH_INTERVAL_MS);
  // Shared handle for the one in-flight author child (default executor
  // only): dispose() terminates it so shutdown never orphans background work.
  const childRef = { current: null };
  const runExternal =
    execRefresh ?? createDefaultExecRefresh({ progressFile, projectDir: resolvedProjectDir, childRef });

  let enabled = false;
  let running = false;
  let timer = null;
  let lastCheckAt = null;
  let lastResult = null;

  function getStatus() {
    return {
      enabled,
      running,
      intervalMs: cadenceMs,
      configured: Boolean(resolveRefreshCommand()),
      lastCheckAt,
      lastResult,
    };
  }

  function emit() {
    if (typeof onStatus === "function") {
      try {
        onStatus(getStatus());
      } catch {
        /* status listeners must never break the scheduler */
      }
    }
  }

  async function runRefreshOnce(_reason = "interval") {
    if (running) return { outcome: "skipped-in-progress", skipped: true };
    if (!enabled) return { outcome: "skipped-disabled", skipped: true };
    running = true;
    emit();
    try {
      let before = null;
      try {
        before = await readSnapshot(progressFile, readFileFn);
      } catch (err) {
        lastCheckAt = nowFn();
        lastResult = "failed";
        emit();
        return { outcome: "failed", error: err, beforeHash: null, afterHash: null };
      }

      let execOutcome = "executed";
      let execError = null;
      try {
        const r = await runExternal();
        if (r && typeof r.outcome === "string") execOutcome = r.outcome;
        if (r && r.error) execError = r.error;
      } catch (err) {
        execOutcome = "failed";
        execError = err;
      }

      if (execOutcome === "not-configured") {
        lastCheckAt = nowFn();
        lastResult = "not-configured";
        emit();
        return { outcome: "not-configured", beforeHash: before.hash, afterHash: before.hash };
      }
      if (execOutcome === "failed") {
        // Non-destructive: keep the on-disk document as-is; the existing
        // SSE fingerprint path keeps showing the last valid content.
        // Read back opportunistically so a partial external write still
        // surfaces through the normal change path instead of being hidden.
        let afterHash = before.hash;
        try {
          const after = await readSnapshot(progressFile, readFileFn);
          afterHash = after.hash;
        } catch {}
        lastCheckAt = nowFn();
        lastResult = "failed";
        emit();
        return { outcome: "failed", error: execError, beforeHash: before.hash, afterHash };
      }
      if (execOutcome === "skipped-in-progress") {
        return { outcome: "skipped-in-progress", skipped: true };
      }

      let after = null;
      try {
        after = await readSnapshot(progressFile, readFileFn);
      } catch (err) {
        lastCheckAt = nowFn();
        lastResult = "failed";
        emit();
        return { outcome: "failed", error: err, beforeHash: before.hash, afterHash: null };
      }

      const changed = after.hash !== before.hash;
      lastCheckAt = nowFn();
      // Unchanged ticks deliberately produce no browser update: the existing
      // SSE change path only fires when the fingerprint actually moves.
      lastResult = changed ? "changed" : "unchanged";
      emit();
      // Author success + canonical read-back success: store the exact bytes
      // as a recovery replica. Warning-only; never flips refresh success.
      try {
        const saveReplica = saveReplicaFn ?? ((f, opts) => defaultSaveRecoveryReplica(f, opts));
        const saved = await saveReplica(progressFile, { bytes: after.bytes });
        if (saved && saved.ok === false) {
          try {
            console.error(
              `cockpit: warning: recovery replica를 저장하지 못했습니다: ${saved.error?.message ?? saved.error ?? "unknown error"}`
            );
          } catch {}
        }
      } catch (err) {
        try {
          console.error(`cockpit: warning: recovery replica를 저장하지 못했습니다: ${err?.message ?? err}`);
        } catch {}
      }
      // Refresh author success is a live adoption event: the reconciled
      // file is Cockpit-managed. Keep the Git-local disposition stable
      // (checkout-local exclude, never repository .gitignore).
      // Warning-only; never flips refresh success.
      try {
        const ensureStorage = ensureStorageFn ?? ((f) => defaultEnsureManagedStorage(f, { adopted: true }));
        const storage = await ensureStorage(progressFile);
        if (storage && storage.ok === false) {
          try {
            console.error(
              `cockpit: warning: local Git exclude를 적용하지 못했습니다: ${storage.error?.message ?? storage.error ?? "unknown error"}`
            );
          } catch {}
        }
      } catch (err) {
        try {
          console.error(`cockpit: warning: local Git exclude를 적용하지 못했습니다: ${err?.message ?? err}`);
        } catch {}
      }
      return {
        outcome: changed ? "changed" : "unchanged",
        beforeHash: before.hash,
        afterHash: after.hash,
      };
    } finally {
      running = false;
      // Emit the settled (non-running) status exactly once per attempt.
      // The in-flight `running: true` emit above keeps tabs honest while
      // the LLM author works; this emit releases them.
      emit();
    }
  }

  function setEnabled(next) {
    const want = Boolean(next);
    if (want && !resolveRefreshCommand()) {
      // No LLM author, no capability: never become operational.
      // Refuse ON immediately so the reader never sees a waiting state
      // that would need the first cadence tick to disprove. The canonical
      // `configured` flag stays the single availability owner; the reader
      // projection reuses it instead of inferring from `enabled` alone.
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      enabled = false;
      lastCheckAt = nowFn();
      lastResult = "not-configured";
      emit();
      return getStatus();
    }
    if (want === enabled && (want === false || timer !== null)) {
      return getStatus();
    }
    enabled = want;
    if (enabled) {
      if (timer === null) {
        timer = setInterval(() => {
          void runRefreshOnce("interval");
        }, cadenceMs);
        // Lifecycle: never keep the viewer server alive by itself. The last-
        // viewer idle shutdown in serve.mjs remains the sole exit owner.
        if (typeof timer.unref === "function") timer.unref();
      }
    } else {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    }
    emit();
    return getStatus();
  }

  function dispose() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    enabled = false;
    // Terminate any in-flight LLM author child so server shutdown never leaves
    // a detached background child behind. Best-effort: a mock executor has
    // no child and this is a no-op.
    const child = childRef.current;
    childRef.current = null;
    if (child) {
      try {
        if (typeof child.kill === "function") child.kill("SIGTERM");
      } catch {
        /* shutdown must never throw while reclaiming the process */
      }
    }
  }

  const __testOnly = {
    getTimer: () => timer,
    isRunning: () => running,
    getChild: () => childRef.current,
  };

  return { getStatus, setEnabled, runRefreshOnce, dispose, __testOnly };
}
