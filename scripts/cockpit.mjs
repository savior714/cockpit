#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ensureFreshBuild } from "./freshness.mjs";
import { parseArgs } from "./target.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "..");

// Version identification never needs (or triggers) a rebuild: report the
// packaged package.json version directly. All other commands fall through
// to the freshness guard and serve.mjs, which owns error reporting for
// invalid arguments.
try {
  if (parseArgs(process.argv.slice(2)).command === "version") {
    let version = "unknown";
    try {
      version =
        JSON.parse(readFileSync(path.join(PKG_ROOT, "package.json"), "utf-8"))?.version ??
        "unknown";
    } catch {
      /* missing/unreadable package.json reports unknown rather than crashing */
    }
    console.log(`cockpit ${version}`);
    process.exit(0);
  }
} catch {
  /* invalid args: serve.mjs reports them identically to before */
}

ensureFreshBuild(PKG_ROOT);
await import("./serve.mjs");
