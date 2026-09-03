#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

const BUILD_INPUT_FILES = [
  "index.html",
  "tsconfig.json",
  "package.json",
  "package-lock.json",
  "vite.config.ts",
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.cjs",
];

const REQUIRED_ARTIFACTS = [
  path.join("dist", "index.html"),
  path.join("dist", "parser.js"),
  path.join("dist", ".build-stamp.json"),
];

function collectFiles(dir, baseDir = dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(full, baseDir));
    } else if (entry.isFile()) {
      files.push(path.relative(baseDir, full));
    }
  }
  return files;
}

export function computeBuildFingerprint(pkgRoot) {
  const fileList = [];

  // 1. All files under src/
  const srcDir = path.join(pkgRoot, "src");
  if (fs.existsSync(srcDir)) {
    const srcFiles = collectFiles(srcDir, pkgRoot);
    fileList.push(...srcFiles);
  }

  // 2. Specific top-level build-affecting configurations and entrypoints
  for (const rel of BUILD_INPUT_FILES) {
    const full = path.join(pkgRoot, rel);
    if (fs.existsSync(full)) {
      try {
        if (fs.statSync(full).isFile()) {
          fileList.push(rel);
        }
      } catch {}
    }
  }

  // Normalize path separators and sort deterministically
  const normalized = fileList.map((f) => f.split(path.sep).join("/"));
  normalized.sort();

  const hash = createHash("sha256");
  for (const rel of normalized) {
    const full = path.join(pkgRoot, rel);
    try {
      const content = fs.readFileSync(full);
      hash.update(rel + "\0");
      hash.update(content);
      hash.update("\0");
    } catch {
      // If a file disappears during calculation, update with missing marker
      hash.update(rel + "\0<missing>\0");
    }
  }

  return hash.digest("hex");
}

export function isLocalDevCheckout(pkgRoot) {
  try {
    const gitPath = path.join(pkgRoot, ".git");
    const srcPath = path.join(pkgRoot, "src");

    if (!fs.existsSync(gitPath)) return false;
    const gitStat = fs.statSync(gitPath);
    if (!gitStat.isDirectory() && !gitStat.isFile()) return false;

    if (!fs.existsSync(srcPath) || !fs.statSync(srcPath).isDirectory()) return false;

    return true;
  } catch {
    return false;
  }
}

export function checkBuildFreshness(pkgRoot) {
  for (const relArtifact of REQUIRED_ARTIFACTS) {
    const full = path.join(pkgRoot, relArtifact);
    if (!fs.existsSync(full)) {
      return { fresh: false, reason: "missing_artifact", artifact: relArtifact };
    }
  }

  const stampPath = path.join(pkgRoot, "dist", ".build-stamp.json");
  let stamp;
  try {
    stamp = JSON.parse(fs.readFileSync(stampPath, "utf-8"));
  } catch {
    return { fresh: false, reason: "invalid_stamp" };
  }

  if (!stamp || typeof stamp.fingerprint !== "string") {
    return { fresh: false, reason: "invalid_stamp" };
  }

  const currentFingerprint = computeBuildFingerprint(pkgRoot);
  if (currentFingerprint !== stamp.fingerprint) {
    return {
      fresh: false,
      reason: "fingerprint_mismatch",
      currentFingerprint,
      stampedFingerprint: stamp.fingerprint,
    };
  }

  return { fresh: true, fingerprint: currentFingerprint };
}

export function writeBuildStamp(pkgRoot) {
  const distDir = path.join(pkgRoot, "dist");
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  const fingerprint = computeBuildFingerprint(pkgRoot);
  const stampPath = path.join(distDir, ".build-stamp.json");
  const data = {
    fingerprint,
  };
  fs.writeFileSync(stampPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
  return data;
}

export function ensureFreshBuild(pkgRoot) {
  if (!isLocalDevCheckout(pkgRoot)) {
    return;
  }

  const freshness = checkBuildFreshness(pkgRoot);
  if (freshness.fresh) {
    return;
  }

  console.error("cockpit: local source changed since the last build; rebuilding viewer...");

  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const npmExecPath = process.env.npm_execpath;

  const spawnOpts = {
    cwd: pkgRoot,
    stdio: "pipe",
    env: process.env,
    encoding: "utf-8",
  };

  let result;
  if (npmExecPath && fs.existsSync(npmExecPath)) {
    result = spawnSync(process.execPath, [npmExecPath, "run", "build"], spawnOpts);
  } else {
    result = spawnSync(npmCmd, ["run", "build"], {
      ...spawnOpts,
      shell: process.platform === "win32",
    });
  }

  if (result.error || result.status !== 0) {
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    console.error("cockpit: local build is stale and rebuild failed; refusing to serve stale assets.");
    process.exit(result.status ?? 1);
  }

  const postCheck = checkBuildFreshness(pkgRoot);
  if (!postCheck.fresh) {
    console.error("cockpit: local build is stale and rebuild failed; refusing to serve stale assets.");
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const pkgRoot = path.resolve(__dirname, "..");
  if (process.argv.includes("--stamp") || process.argv.includes("stamp")) {
    writeBuildStamp(pkgRoot);
  }
}
