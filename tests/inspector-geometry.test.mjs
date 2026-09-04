import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(REPO_ROOT, "src", "style.css"), "utf-8");
const html = fs.readFileSync(path.join(REPO_ROOT, "index.html"), "utf-8");
const mainTs = fs.readFileSync(path.join(REPO_ROOT, "src", "main.ts"), "utf-8");

/**
 * Inspector workspace-geometry invariants.
 *
 * Canonical owner: .primary-workspace owns both the overview rail and the
 * Inspector on desktop. The Inspector must never derive its horizontal
 * position from the viewport (position:fixed + right:...) on desktop, or it
 * detaches from the centered max-width app shell on wide viewports.
 */

// Collect every declaration block for an exact selector, at any nesting level
// (base rules and @media overrides alike), with comments stripped.
function ruleBlocks(source, selector) {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks = [];
  const needle = `${selector} {`;
  let from = 0;
  while (true) {
    const start = clean.indexOf(needle, from);
    if (start === -1) return blocks;
    let depth = 0;
    let i = start + needle.length - 1;
    for (; i < clean.length; i++) {
      if (clean[i] === "{") depth++;
      else if (clean[i] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    blocks.push(clean.slice(start + needle.length, i));
    from = i + 1;
  }
}

// Return the full text of every @media block whose query contains `query`.
function mediaBlocks(source, query) {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = [];
  let from = 0;
  while (true) {
    const at = clean.indexOf("@media", from);
    if (at === -1) return out;
    const open = clean.indexOf("{", at);
    const header = clean.slice(at, open);
    let depth = 0;
    let i = open;
    for (; i < clean.length; i++) {
      if (clean[i] === "{") depth++;
      else if (clean[i] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    if (header.includes(query)) out.push(clean.slice(open + 1, i));
    from = i + 1;
  }
}

const norm = (s) => s.replace(/\s+/g, " ").trim();

test("app shell stays a bounded centered container", () => {
  const [cockpit] = ruleBlocks(css, ".cockpit");
  assert.ok(cockpit, ".cockpit rule must exist");
  assert.match(norm(cockpit), /max-width:\s*1680px/, "shell keeps its max-width bound");
  assert.match(norm(cockpit), /margin:\s*0 auto/, "shell stays centered");
});

test("primary-workspace owns map + right side via one grid", () => {
  const [workspace] = ruleBlocks(css, ".primary-workspace");
  assert.ok(workspace, ".primary-workspace rule must exist");
  const body = norm(workspace);
  assert.match(body, /display:\s*grid/, "workspace is the grid owner");
  assert.match(
    body,
    /grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    "map column keeps first-track minmax(0, 1fr) priority"
  );
  assert.match(body, /grid-template-areas:\s*"map side"/, "workspace names map + side areas");
});

test("overview rail and inspector project onto the same side area", () => {
  const [overview] = ruleBlocks(css, ".overview-panel");
  assert.ok(overview, ".overview-panel rule must exist");
  assert.match(norm(overview), /grid-area:\s*side/, "overview lives in the side area");

  const [slotMap] = ruleBlocks(css, "#slot-map");
  assert.ok(slotMap, "#slot-map placement rule must exist");
  assert.match(norm(slotMap), /grid-area:\s*map/, "map lives in the map area");

  const drawerRules = ruleBlocks(css, ".universal-inspector-drawer");
  assert.ok(drawerRules.length > 0, "inspector drawer rule must exist");
  assert.ok(
    drawerRules.some((b) => /grid-area:\s*side/.test(norm(b))),
    "inspector is projected onto the same side area as the overview rail"
  );
});

test("desktop inspector geometry is workspace-relative, never viewport-anchored", () => {
  const drawerRules = ruleBlocks(css, ".universal-inspector-drawer");
  const desktop = drawerRules.filter(
    (b) => /position:\s*sticky/.test(norm(b)) && /width:\s*100%/.test(norm(b))
  );
  assert.ok(desktop.length > 0, "desktop drawer must be sticky with rail-tracking width:100%");

  for (const b of drawerRules) {
    const body = norm(b);
    if (/position:\s*sticky/.test(body)) {
      assert.doesNotMatch(body, /position:\s*fixed/, "sticky desktop rule must not be fixed");
      assert.doesNotMatch(body, /(^|;)\s*right:/, "sticky desktop rule must not anchor to viewport right");
    }
  }
  // No viewport-width JS geometry reads anywhere near the inspector logic.
  assert.doesNotMatch(mainTs, /window\.innerWidth/, "no JS viewport measuring for layout");
  assert.doesNotMatch(mainTs, /inspector-aside[\s\S]{0,400}\.style\.(left|right|top|width)/, "no JS coordinate writes");
});

test("desktop inspector-open fully replaces the overview rail (no partial overlap)", () => {
  const desktopMedia = mediaBlocks(css, "min-width: 769px");
  assert.ok(desktopMedia.length > 0, "desktop-only media block must exist");
  const joined = norm(desktopMedia.join(" "));
  assert.match(
    joined,
    /\.primary-workspace:has\(>[^)]*#inspector-aside:not\(\[hidden\]\)[^)]*\)\s*>\s*#overview-panel\s*\{\s*display:\s*none;?\s*\}/,
    "open inspector hides the overview rail in the shared area via existing hidden state"
  );
});

test("narrow layout keeps a viewport-contained compact sheet", () => {
  const mobileMedia = mediaBlocks(css, "max-width: 768px");
  assert.ok(mobileMedia.length > 0, "mobile media block must exist");
  const joined = mobileMedia.join(" ");
  const drawerRules = ruleBlocks(joined, ".universal-inspector-drawer");
  assert.ok(drawerRules.length > 0, "mobile drawer override must exist");
  const body = norm(drawerRules.join(" "));
  assert.match(body, /position:\s*fixed/, "narrow drawer stays a fixed sheet");
  assert.match(body, /top:\s*10px/, "narrow drawer keeps top inset");
  assert.match(body, /right:\s*10px/, "narrow drawer keeps right inset");
  assert.match(body, /width:\s*calc\(100vw - 20px\)/, "narrow width never exceeds the viewport");
  assert.match(body, /max-height:\s*calc\(100vh - 20px\)/, "narrow height never exceeds the viewport");
  // overflow is inherited from the base drawer rule (the mobile override does
  // not touch it), so long narrow content scrolls inside the sheet.
  const baseDrawer = ruleBlocks(css, ".universal-inspector-drawer");
  assert.ok(
    baseDrawer.some((b) => /overflow:\s*auto/.test(norm(b))),
    "long narrow content scrolls inside the sheet via the base overflow rule"
  );

  const [workspace] = ruleBlocks(joined, ".primary-workspace");
  assert.ok(workspace, "mobile workspace override must exist");
  assert.match(
    norm(workspace),
    /grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    "narrow workspace collapses to a single column"
  );
});

test("inspector DOM lives inside the primary workspace", () => {
  const workspaceIdx = html.indexOf('id="primary-workspace"');
  const asideIdx = html.indexOf('id="inspector-aside"');
  const overviewIdx = html.indexOf('id="overview-panel"');
  assert.ok(workspaceIdx !== -1 && asideIdx !== -1 && overviewIdx !== -1, "workspace/overview/inspector ids must exist");
  assert.ok(asideIdx > workspaceIdx, "inspector is inside the workspace");
  assert.ok(overviewIdx > workspaceIdx, "overview is inside the workspace");
  const contextIdx = html.indexOf('id="context-region"');
  assert.ok(asideIdx < contextIdx, "inspector stays in the workspace, above the context region");
});

test("inspector open/close owns visibility state only, not geometry", () => {
  assert.match(mainTs, /aside\.hidden = false/, "open path reveals via hidden state");
  assert.match(mainTs, /aside\.hidden = true/, "close path hides via hidden state");
  assert.doesNotMatch(mainTs, /classList\.(toggle|add|remove)\(\s*["']inspector-open/, "no parallel JS layout class duplicating geometry");
});
