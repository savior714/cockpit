#!/usr/bin/env node
// Cockpit optional refresh orchestration: the single small boundary that owns
// the opt-in automatic PROGRESS refresh cadence.
//
// What this module owns:
//   - one runtime-owned scheduler (10-minute cadence, single timer per process)
//   - invoking one configured external refresh executor per tick
//   - read-back of the target PROGRESS.md and before/after comparison
//   - non-destructive status reporting (never writes PROGRESS.md itself)
//
// What this module explicitly does NOT own:
//   - repository / project semantics analysis
//   - PROGRESS.md content generation or conservative-PATCH decisions
//   - file watching / live reload (owned by serve.mjs SSE path)
//   - browser timers or localStorage (the server is the sole scheduler owner)
//
// The external executor (COCKPIT_REFRESH_COMMAND) is owned outside Cockpit.
// It must reconcile fresh evidence with the existing document and PATCH only
// material semantic deltas. When it is not configured, refresh ticks are a
// no-op that preserve the current document and screen.
//
// Lifecycle (last-viewer shutdown):
//   - the cadence timer is unref'd, so it never keeps the Node process alive
//     by itself; the viewer lifecycle in serve.mjs (active SSE viewers +
//     short idle grace) remains the sole owner of process exit.
//   - dispose() clears the timer and terminates any in-flight external child
//     so shutdown never leaks a detached background process.
//   - activation is defined: enabling arms the timer; the first external
//     invocation happens on the next cadence tick, never immediately and
//     never from the browser.

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { exec } from "node:child_process";
import path from "node:path";

export const DEFAULT_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
export const DEFAULT_REFRESH_TIMEOUT_MS = 5 * 60 * 1000;

function parsePositiveInt(raw, fallback) {
  const n = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isSafeInteger(n) || n <= 0) return fallback;
  return n;
}

export function resolveRefreshIntervalMs(env = process.env) {
  return parsePositiveInt(env?.COCKPIT_REFRESH_INTERVAL_MS, DEFAULT_REFRESH_INTERVAL_MS);
}

export function resolveRefreshTimeoutMs(env = process.env) {
  return parsePositiveInt(env?.COCKPIT_REFRESH_TIMEOUT_MS, DEFAULT_REFRESH_TIMEOUT_MS);
}

export function resolveRefreshCommand(env = process.env) {
  const raw = String(env?.COCKPIT_REFRESH_COMMAND ?? "").trim();
  return raw ? raw : null;
}

function hashBuffer(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

async function readSnapshot(file, readFileFn = readFile) {
  const buf = await readFileFn(file);
  const content = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf), "utf-8");
  return { bytes: content, hash: hashBuffer(content) };
}

function runShellCommand(command, { cwd, timeoutMs, env, onSpawn } = {}) {
  return new Promise((resolve) => {
    let child = null;
    try {
      child = exec(
        command,
        { cwd, timeout: timeoutMs, env, maxBuffer: 4 * 1024 * 1024, shell: "/bin/sh" },
        (error, _stdout, _stderr) => {
          if (error) {
            resolve({ ok: false, error });
            return;
          }
          resolve({ ok: true });
        }
      );
    } catch (err) {
      resolve({ ok: false, error: err });
      return;
    }
    if (child && typeof onSpawn === "function") {
      try {
        onSpawn(child);
      } catch {
        /* spawn tracking must never break execution */
      }
    }
  });
}

export function createDefaultExecRefresh({ progressFile, projectDir, childRef } = {}) {
  return async () => {
    const command = resolveRefreshCommand();
    if (!command) return { outcome: "not-configured" };
    const timeoutMs = resolveRefreshTimeoutMs();
    const result = await runShellCommand(command, {
      cwd: projectDir ?? path.dirname(progressFile),
      timeoutMs,
      env: {
        ...process.env,
        PROGRESS_FILE: progressFile,
        PROJECT_DIR: projectDir ?? path.dirname(progressFile),
      },
      onSpawn: (child) => {
        if (childRef && typeof childRef === "object") childRef.current = child;
      },
    });
    if (childRef && typeof childRef === "object") childRef.current = null;
    if (!result.ok) return { outcome: "failed", error: result.error };
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
} = {}) {
  if (!progressFile) throw new Error("createRefreshOrchestrator requires progressFile");
  const resolvedProjectDir = projectDir ?? path.dirname(progressFile);
  const cadenceMs = parsePositiveInt(intervalMs, DEFAULT_REFRESH_INTERVAL_MS);
  // Shared handle for the one in-flight external child (default executor
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
      return {
        outcome: changed ? "changed" : "unchanged",
        beforeHash: before.hash,
        afterHash: after.hash,
      };
    } finally {
      running = false;
      // Emit the settled (non-running) status exactly once per attempt.
      // The in-flight `running: true` emit above keeps tabs honest while
      // the external owner works; this emit releases them.
      emit();
    }
  }

  function setEnabled(next) {
    const want = Boolean(next);
    if (want && !resolveRefreshCommand()) {
      // No external owner, no capability: never become operational.
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
    // Terminate any in-flight external owner so server shutdown never leaves
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
