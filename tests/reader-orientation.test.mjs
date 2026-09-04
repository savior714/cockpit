import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import { splitSections, extractSectionRawText, escapeHtml } from "../dist/markdown-structure.js";
import { parseProjectMap, parseAreaDetails } from "../dist/semantic-construction.js";
import { checkProgressStructure } from "../dist/structural-check.js";
import { renderNativeMap } from "../dist/inspector-projection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const md = new MarkdownIt({ html: true, linkify: true });

/**
 * Reader-orientation acceptance: a first-time reader restores purpose,
 * structure, position, next step, and material blockers from the primary
 * surface alone — without studying a Cockpit-specific ontology.
 */
const FIXTURES = ["canonical-minimal.md", "cockpit-self.md", "nextchart-emr.md", "project-vocabulary.md"];

for (const fixture of FIXTURES) {
  test(`Reader orientation restores from primary surface: ${fixture}`, () => {
    const source = fs.readFileSync(path.join(__dirname, "fixtures", fixture), "utf-8");
    const result = checkProgressStructure(source);
    assert.equal(result.ok, true, result.errors.join("; "));

    const { title, sections } = splitSections(md.parse(source, {}));

    // 1. Purpose: title + product frame answer "what is this for".
    assert.ok(title.length > 0);
    const frame = extractSectionRawText(sections.get("project frame") ?? []);
    assert.ok(frame.length > 0, "product goal must answer purpose");

    // 2. Structure + position: map anchor with a current position.
    const map = parseProjectMap(sections.get("project map") ?? []);
    assert.equal(map.isNativeMap, true);
    assert.ok(map.rails.length > 0, "structure must exist");
    assert.equal(map.hasCurrentStage, true, "current position must be marked");
    const items = map.rails.flatMap((r) => r.groups).flatMap((g) => g.items);
    assert.ok(items.length > 0);
    assert.ok(items.some((i) => i.isCurrentStage), "at least one item is the current position");

    // 3. Now / Next: plain-text orientation, no taxonomy study.
    const situation = extractSectionRawText(sections.get("situation") ?? []);
    const next = extractSectionRawText(sections.get("next") ?? []);
    assert.ok(situation.length > 0, "Now must be present");
    assert.ok(next.length > 0, "Next must be present");
    assert.ok(next.includes("→"), "Next must read as a state transition");

    // 4. Blocked only when material: facing section is optional.
    const facing = extractSectionRawText(sections.get("facing") ?? []);
    if (facing.length > 0) {
      assert.ok(/막|제한|부족|미확정|잔여|혼잡|필요|open|block|limit|pending|remain|constrain/i.test(facing), "Blocked must name a material constraint");
    }

    // 5. Drill-down: every map item has an area detail with evidence.
    const details = parseAreaDetails(sections.get("area details") ?? []);
    for (const item of items) {
      const detail = details.get(item.title.trim().toLowerCase().replace(/\s+/g, " "));
      assert.ok(detail, `map item drills down: ${item.title}`);
      const heads = detail.subsections.map((s) => s.subheading);
      assert.ok(heads.some((h) => /근거|evidence/i.test(h)), `evidence reachable: ${item.title}`);
    }

    // 6. Map renders every card: the anchor is visually complete.
    const html = renderNativeMap(map);
    for (const item of items) {
      assert.ok(html.includes(escapeHtml(item.title)), `map card renders: ${item.title}`);
    }
  });
}

test("Primary DOM order anchors orientation: map before Now/Next/Blocked; Recent reads as secondary context", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf-8");
  const primary = ["slot-map", "slot-now", "slot-next", "slot-blocked"]
    .map((id) => html.indexOf(`id="${id}"`));
  assert.ok(primary.every((i) => i !== -1));
  assert.deepEqual([...primary].sort((a, b) => a - b), primary);
  const recent = html.indexOf('id="slot-recent"');
  const context = html.indexOf('id="context-region"');
  assert.ok(recent !== -1 && context !== -1 && recent > context, "Recent must live in the secondary context region");
  assert.ok(recent > primary[primary.length - 1], "Recent must follow the primary Now/Next/Blocked surface");
});
