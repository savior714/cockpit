#!/usr/bin/env node
// Cockpit recovery replica: a best-effort recovery copy of the last
// author-success PROGRESS.md bytes, stored outside any target repository.
//
// Product boundary (fixed):
//   - canonical target stays <project>/PROGRESS.md.
//   - the viewer stays read-only.
//   - the LLM author keeps PROGRESS.md semantic ownership.
//   - this replica is NEVER authority/SSOT and NEVER canonical truth.
//   - no repository analyzer lives here: no revision inspection, no
//     checkout-structure inspection, no ignore-file mutation, no automatic
//     meaning refresh, no DB/registry/daemon/scheduler, no replica
//     metadata/state machine as a product model.
//
// What this module owns (only):
//   - deterministic project keying from the canonical progress-file identity
//   - one-file exact-byte save / existence check / explicit restore
//     under a repo-outside user-persistent location.
//
// Replica layout (deliberately boring):
//   <replicaRoot>/<sha256(canonicalProgressFile)>/PROGRESS.md
// Default replicaRoot is ~/.cockpit/replicas (override COCKPIT_REPLICA_DIR
// for tests/isolation only). The replica file holds the exact canonical
// bytes; there is no sidecar metadata file. Filesystem mtime is the only
// staleness hint and is shown to the user, never trusted as truth.

import { createHash } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { realpath } from "node:fs/promises";

export const REPLICA_FILENAME = "PROGRESS.md";
export const REPLICA_DIR_ENV = "COCKPIT_REPLICA_DIR";

export function resolveReplicaRoot(env = process.env) {
  const override = String(env?.[REPLICA_DIR_ENV] ?? "").trim();
  if (override) return path.resolve(override);
  return path.join(homedir(), ".cockpit", "replicas");
}

/**
 * Canonicalize a progress-file identity to one absolute path string.
 * Prefers filesystem realpath (stable across /tmp -> /private/tmp style
 * symlinks); falls back to path.resolve when nothing exists yet.
 * Never touches Git, never inspects repository state.
 */
export async function canonicalProgressPath(progressFile) {
  const abs = path.resolve(progressFile);
  try {
    return await realpath(abs);
  } catch {}
  try {
    const parentReal = await realpath(path.dirname(abs));
    return path.join(parentReal, path.basename(abs));
  } catch {}
  return abs;
}

export function replicaKeyForCanonicalPath(canonicalPath) {
  return createHash("sha256").update(canonicalPath, "utf-8").digest("hex");
}

export async function replicaLocationForProgressFile(progressFile, env = process.env) {
  const canonicalPath = await canonicalProgressPath(progressFile);
  const key = replicaKeyForCanonicalPath(canonicalPath);
  const replicaRoot = resolveReplicaRoot(env);
  const replicaFile = path.join(replicaRoot, key, REPLICA_FILENAME);
  return { key, canonicalPath, replicaRoot, replicaFile };
}

/**
 * Save the current canonical bytes as the recovery replica.
 * Must be called only after canonical author success + canonical
 * read-back success. Exact-byte equivalent: no encoding conversion.
 * Returns { ok:true, ... } or { ok:false, error }; never throws for
 * filesystem failures so callers can warn without flipping success.
 */
export async function saveRecoveryReplica(progressFile, { bytes = null, env = process.env } = {}) {
  let loc;
  try {
    loc = await replicaLocationForProgressFile(progressFile, env);
  } catch (err) {
    return { ok: false, error: err };
  }
  try {
    const canonicalBytes = bytes ?? (await readFile(loc.canonicalPath));
    const buf = Buffer.isBuffer(canonicalBytes)
      ? canonicalBytes
      : Buffer.from(String(canonicalBytes), "utf-8");
    await mkdir(path.dirname(loc.replicaFile), { recursive: true });
    await writeFile(loc.replicaFile, buf);
    return { ok: true, key: loc.key, replicaFile: loc.replicaFile, canonicalPath: loc.canonicalPath };
  } catch (err) {
    return { ok: false, error: err, key: loc?.key, replicaFile: loc?.replicaFile };
  }
}

/**
 * Existence-only check for the missing-file flow. No content analysis,
 * no Git inspection. Returns { exists:false, ... } when absent.
 */
export async function readRecoveryReplica(progressFile, { env = process.env } = {}) {
  let loc;
  try {
    loc = await replicaLocationForProgressFile(progressFile, env);
  } catch (err) {
    return { exists: false, error: err };
  }
  let st = null;
  try {
    st = await stat(loc.replicaFile);
  } catch {
    return { exists: false, key: loc.key, replicaFile: loc.replicaFile, canonicalPath: loc.canonicalPath };
  }
  if (!st || !st.isFile()) {
    return { exists: false, key: loc.key, replicaFile: loc.replicaFile, canonicalPath: loc.canonicalPath };
  }
  let replicaBytes = null;
  try {
    replicaBytes = await readFile(loc.replicaFile);
  } catch (err) {
    return { exists: false, key: loc.key, replicaFile: loc.replicaFile, canonicalPath: loc.canonicalPath, error: err };
  }
  return {
    exists: true,
    key: loc.key,
    replicaFile: loc.replicaFile,
    canonicalPath: loc.canonicalPath,
    bytes: replicaBytes,
    mtimeMs: st.mtimeMs,
    size: st.size,
  };
}

/**
 * Restore the replica's exact bytes to the canonical target.
 * The caller MUST have obtained explicit interactive confirmation first;
 * this function performs no prompting itself. Exact bytes, no merge.
 */
export async function restoreRecoveryReplica(progressFile, { env = process.env } = {}) {
  let loc;
  try {
    loc = await replicaLocationForProgressFile(progressFile, env);
  } catch (err) {
    return { ok: false, error: err };
  }
  let replicaBytes;
  try {
    replicaBytes = await readFile(loc.replicaFile);
  } catch (err) {
    return { ok: false, error: err, key: loc.key, replicaFile: loc.replicaFile };
  }
  try {
    await mkdir(path.dirname(loc.canonicalPath), { recursive: true });
    await writeFile(loc.canonicalPath, replicaBytes);
    return { ok: true, key: loc.key, replicaFile: loc.replicaFile, canonicalPath: loc.canonicalPath, bytes: replicaBytes };
  } catch (err) {
    return { ok: false, error: err, key: loc.key, replicaFile: loc.replicaFile };
  }
}
