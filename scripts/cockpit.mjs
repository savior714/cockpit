#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { ensureFreshBuild } from "./freshness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "..");

ensureFreshBuild(PKG_ROOT);
await import("./serve.mjs");
