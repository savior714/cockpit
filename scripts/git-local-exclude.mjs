#!/usr/bin/env node
// Cockpit PROGRESS.md Git-local storage disposition: the single small owner
// for keeping a Cockpit-managed PROGRESS.md out of `git status` noise
// WITHOUT touching repository-shared policy.
//
// Product meaning (fixed):
//   PROGRESS.md = project-local durable understanding surface
//                + Git-local by default + tracked opt-in.
//
// What this module owns (only):
//   - whether the project directory is inside a Git work tree
//   - the repository top-level for a progress file
//   - whether the progress file is tracked
//   - whether an existing ignore rule already covers it
//   - the checkout-local exclude location (NOT repository source)
//   - idempotent addition of one exact repo-relative rule
//   - Cockpit-managed content identification (adoption rule below)
//
// What this module explicitly does NOT own:
//   - Git history / branch / freshness / revision inspection
//   - commit / push / branch / merge / rebase / notes
//   - diff interpretation / repository semantic analysis
//   - publication / worktree scheduling / project progress judgment
//   - repository `.gitignore`, global gitignore, core.excludesFile,
//     global Git config
//   - skip-worktree / assume-unchanged / git rm --cached / git add
//   - progress DB / index / registry / project state files
//   - project-wide `PROGRESS.md` wildcard rules (exact path only)
//   - PROGRESS.md content authorship (owned by scripts/author.mjs)
//
// Ownership / adoption rule (smallest reliable):
//   "untracked file이다"만으로 ownership을 추론하지 않는다. A file counts
//   as Cockpit-managed only when (a) the caller passes `adopted: true`
//   after a live Cockpit authorship/refresh/restore success in the current
//   process, or (b) its content carries a Cockpit authorship marker: the
//   deployed provenance anchor (`<!-- cockpit-author-observed: ... -->`,
//   vocabulary owned by scripts/author.mjs) or the explicit
//   `<!-- cockpit-progress -->` marker. No persistent DB/registry, no
//   separate project state file, no content mutation here (read-only sniff).
//
// Git mechanics (repository-native, minimal):
//   - `git rev-parse --is-inside-work-tree` (repo detection)
//   - `git rev-parse --show-toplevel` (top-level)
//   - `git rev-parse --path-format=absolute --git-path info/exclude`
//     (checkout-local exclude location; never assumes `.git` is a
//     directory — linked worktrees keep `.git` as a file and this resolves
//     to the correct per-worktree info/exclude)
//   - `git ls-files --error-unmatch -- <rel>` (tracked check)
//   - `git check-ignore -q -- <rel>` (existing-ignore check)
//   Never before author/check success: callers invoke this only after the
//   semantic success they own. Failures here never flip that success;
//   callers surface them as warnings (see storageWarningFor).

import { execFile } from "node:child_process";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { realpath } from "node:fs/promises";
import { PROVENANCE_ANCHOR_PREFIX } from "./author.mjs";

export const COCKPIT_PROGRESS_MARKER = "cockpit-progress";
const GIT_TIMEOUT_MS = 5000;

function runGit(args, cwd) {
  return new Promise((resolve) => {
    execFile("git", args, { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: 256 * 1024 }, (error, stdout) => {
      if (error) {
        resolve({ ok: false, code: error?.code ?? 1, stdout: String(stdout ?? "") });
        return;
      }
      resolve({ ok: true, code: 0, stdout: String(stdout ?? "") });
    });
  });
}

async function canonicalPath(p) {
  const abs = path.resolve(p);
  try {
    return await realpath(abs);
  } catch {}
  try {
    const parentReal = await realpath(path.dirname(abs));
    return path.join(parentReal, path.basename(abs));
  } catch {}
  return abs;
}

/**
 * Read-only sniff: does this PROGRESS.md content carry Cockpit authorship
 * evidence? Either the deployed provenance anchor or the explicit
 * ownership marker. Never reads Git, never writes.
 */
export function isCockpitManagedContent(text) {
  const s = String(text ?? "");
  return s.includes(`<!-- ${PROVENANCE_ANCHOR_PREFIX}`) || s.includes(`<!-- ${COCKPIT_PROGRESS_MARKER}`);
}

/**
 * Read-only classification of one progress file's storage disposition.
 * Never writes. `{ kind }` is one of:
 *   non-git | outside-repo | tracked | ignored-existing |
 *   managed-local-ready | managed-local-exists | unmanaged
 * plus repoTopLevel / rule / managedByContent when known.
 */
export async function describeDisposition(progressFile) {
  const canonical = await canonicalPath(progressFile);
  const probeDir = path.dirname(canonical);
  const inside = await runGit(["rev-parse", "--is-inside-work-tree"], probeDir);
  if (!inside.ok || inside.stdout.trim() !== "true") {
    return { kind: "non-git", progressFile: canonical, managedByContent: false, rule: null, repoTopLevel: null };
  }
  const top = await runGit(["rev-parse", "--show-toplevel"], probeDir);
  if (!top.ok) {
    return { kind: "non-git", progressFile: canonical, managedByContent: false, rule: null, repoTopLevel: null };
  }
  const repoTopLevel = (await canonicalPath(top.stdout.trim())) ?? top.stdout.trim();
  const rel = path.relative(repoTopLevel, canonical);
  if (!rel || rel === "." || rel.startsWith("..") || path.isAbsolute(rel)) {
    return { kind: "outside-repo", progressFile: canonical, managedByContent: false, rule: null, repoTopLevel };
  }
  const rule = `/${rel.split(path.sep).join("/")}`;
  const tracked = await runGit(["ls-files", "--error-unmatch", "--", rel], repoTopLevel);
  if (tracked.ok) {
    return { kind: "tracked", progressFile: canonical, managedByContent: false, rule, repoTopLevel };
  }
  const ignored = await runGit(["check-ignore", "-q", "--", rel], repoTopLevel);
  if (ignored.ok) {
    return { kind: "ignored-existing", progressFile: canonical, managedByContent: false, rule, repoTopLevel };
  }
  let managedByContent = false;
  try {
    managedByContent = isCockpitManagedContent(await readFile(canonical, "utf-8"));
  } catch {
    managedByContent = false;
  }
  if (!managedByContent) {
    return { kind: "unmanaged", progressFile: canonical, managedByContent, rule, repoTopLevel };
  }
  const exclude = await resolveExcludeFile(repoTopLevel);
  if (!exclude.ok) {
    return { kind: "managed-local-ready", progressFile: canonical, managedByContent, rule, repoTopLevel };
  }
  const has = await excludeFileHasRule(exclude.file, rule);
  return {
    kind: has ? "managed-local-exists" : "managed-local-ready",
    progressFile: canonical,
    managedByContent,
    rule,
    repoTopLevel,
  };
}

async function resolveExcludeFile(repoTopLevel) {
  const r = await runGit(["rev-parse", "--path-format=absolute", "--git-path", "info/exclude"], repoTopLevel);
  if (r.ok && r.stdout.trim()) {
    return { ok: true, file: r.stdout.trim() };
  }
  // Older Git without --path-format: resolve the (possibly relative)
  // --git-path output against the invocation cwd. Still never assumes
  // `.git` is a directory.
  const legacy = await runGit(["rev-parse", "--git-path", "info/exclude"], repoTopLevel);
  if (!legacy.ok || !legacy.stdout.trim()) {
    return { ok: false, error: new Error("cannot resolve checkout-local exclude location") };
  }
  const raw = legacy.stdout.trim();
  return { ok: true, file: path.isAbsolute(raw) ? raw : path.resolve(repoTopLevel, raw) };
}

async function excludeFileHasRule(excludeFile, rule) {
  let current = "";
  try {
    current = await readFile(excludeFile, "utf-8");
  } catch (err) {
    if (err?.code !== "ENOENT") throw err;
    return false;
  }
  return current.split("\n").some((line) => line.trim() === rule);
}

/**
 * Idempotent addition of one exact repo-relative rule to the
 * checkout-local exclude file. Safe no-ops (ok:true) for non-git,
 * outside-repo, tracked, and already-ignored files. This function assumes
 * the caller already owns the adoption decision (see
 * ensureManagedStorage); it performs no managed-content gating itself.
 * Never touches repository source (no .gitignore read or write).
 */
export async function ensureLocalExclude(progressFile) {
  const canonical = await canonicalPath(progressFile);
  const probeDir = path.dirname(canonical);
  const inside = await runGit(["rev-parse", "--is-inside-work-tree"], probeDir);
  if (!inside.ok || inside.stdout.trim() !== "true") {
    return { ok: true, action: "non-git", progressFile: canonical, rule: null };
  }
  const top = await runGit(["rev-parse", "--show-toplevel"], probeDir);
  if (!top.ok) {
    return { ok: true, action: "non-git", progressFile: canonical, rule: null };
  }
  const repoTopLevel = (await canonicalPath(top.stdout.trim())) ?? top.stdout.trim();
  const rel = path.relative(repoTopLevel, canonical);
  if (!rel || rel === "." || rel.startsWith("..") || path.isAbsolute(rel)) {
    return { ok: true, action: "outside-repo", progressFile: canonical, rule: null, repoTopLevel };
  }
  // Exact repo-relative rule only. A leading slash anchors to the
  // top-level (info/exclude applies at root scope); a bare
  // `PROGRESS.md` wildcard is forbidden.
  const rule = `/${rel.split(path.sep).join("/")}`;
  const tracked = await runGit(["ls-files", "--error-unmatch", "--", rel], repoTopLevel);
  if (tracked.ok) {
    return { ok: true, action: "already-tracked", progressFile: canonical, rule, repoTopLevel };
  }
  const ignored = await runGit(["check-ignore", "-q", "--", rel], repoTopLevel);
  if (ignored.ok) {
    return { ok: true, action: "already-ignored", progressFile: canonical, rule, repoTopLevel };
  }
  const exclude = await resolveExcludeFile(repoTopLevel);
  if (!exclude.ok) {
    return { ok: false, action: "housekeeping-failed", progressFile: canonical, rule, repoTopLevel, error: exclude.error };
  }
  try {
    if (await excludeFileHasRule(exclude.file, rule)) {
      return { ok: true, action: "already-excluded", progressFile: canonical, rule, repoTopLevel, excludeFile: exclude.file };
    }
    let current = "";
    try {
      current = await readFile(exclude.file, "utf-8");
    } catch (err) {
      if (err?.code !== "ENOENT") throw err;
      current = "";
    }
    const prefix = current === "" ? "" : current.endsWith("\n") ? "" : "\n";
    await mkdir(path.dirname(exclude.file), { recursive: true });
    await writeFile(exclude.file, `${current}${prefix}${rule}\n`, "utf-8");
    return { ok: true, action: "added", progressFile: canonical, rule, repoTopLevel, excludeFile: exclude.file };
  } catch (err) {
    return { ok: false, action: "housekeeping-failed", progressFile: canonical, rule, repoTopLevel, excludeFile: exclude.file, error: err };
  }
}

/**
 * Gated entry: apply Git-local disposition only for Cockpit-managed files.
 * `adopted: true` is the caller's live adoption event (bootstrap author
 * success, explicit recovery restore success, refresh author success in
 * this process). Otherwise the file's own content marker decides; an
 * untracked non-Cockpit file is never claimed (`unmanaged-skipped`, still
 * ok:true so callers keep read-only behavior).
 */
export async function ensureManagedStorage(progressFile, { adopted = false } = {}) {
  const canonical = await canonicalPath(progressFile);
  const probeDir = path.dirname(canonical);
  const inside = await runGit(["rev-parse", "--is-inside-work-tree"], probeDir);
  if (!inside.ok || inside.stdout.trim() !== "true") {
    return { ok: true, action: "non-git", progressFile: canonical, rule: null };
  }
  const top = await runGit(["rev-parse", "--show-toplevel"], probeDir);
  if (!top.ok) {
    return { ok: true, action: "non-git", progressFile: canonical, rule: null };
  }
  const repoTopLevel = (await canonicalPath(top.stdout.trim())) ?? top.stdout.trim();
  const rel = path.relative(repoTopLevel, canonical);
  if (!rel || rel === "." || rel.startsWith("..") || path.isAbsolute(rel)) {
    return { ok: true, action: "outside-repo", progressFile: canonical, rule: null, repoTopLevel };
  }
  const rule = `/${rel.split(path.sep).join("/")}`;
  const tracked = await runGit(["ls-files", "--error-unmatch", "--", rel], repoTopLevel);
  if (tracked.ok) {
    return { ok: true, action: "already-tracked", progressFile: canonical, rule, repoTopLevel };
  }
  const ignored = await runGit(["check-ignore", "-q", "--", rel], repoTopLevel);
  if (ignored.ok) {
    return { ok: true, action: "already-ignored", progressFile: canonical, rule, repoTopLevel };
  }
  let managed = Boolean(adopted);
  if (!managed) {
    try {
      managed = isCockpitManagedContent(await readFile(canonical, "utf-8"));
    } catch {
      managed = false;
    }
  }
  if (!managed) {
    return { ok: true, action: "unmanaged-skipped", progressFile: canonical, rule, repoTopLevel };
  }
  return ensureLocalExclude(progressFile);
}

/**
 * Warning text for housekeeping failures. Returns null when there is
 * nothing to warn about. Semantic success always stands; the file is kept;
 * residual `git status` noise is disclosed.
 */
export function storageWarningFor(result) {
  if (!result || result.ok) return null;
  const detail = result.error?.message ?? result.error ?? "unknown error";
  return (
    `cockpit: warning: local Git exclude를 적용하지 못했습니다: ${detail}\n` +
    `PROGRESS.md 내용은 그대로 유지됩니다: ${result.progressFile ?? ""}\n` +
    `git status에 PROGRESS.md가 계속 보일 수 있습니다.`
  );
}
