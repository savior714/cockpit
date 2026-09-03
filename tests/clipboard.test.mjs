import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSource = (rel) => fs.readFileSync(path.join(__dirname, "..", rel), "utf-8");

// Reference simulation of the per-toast coalescing contract enforced in
// src/main.ts (showCopyFeedback / hideCopyFeedback): clearing the previous
// timer plus an identity guard so a stale timeout can never hide newer feedback.
// The static tests below pin the real implementation to this same contract;
// this runtime test proves the contract itself holds under repeated use.
function makeSimulatedFeedbackLoop() {
  const timers = new Map();
  let nextId = 1;
  const scheduled = new Map();
  const fakeWindow = {
    setTimeout(cb) {
      const id = nextId++;
      scheduled.set(id, cb);
      return id;
    },
  };
  const fakeClearTimeout = (id) => {
    scheduled.delete(id);
  };
  function show(toast, ok, successText, failureText) {
    const pending = timers.get(toast);
    if (pending !== undefined) fakeClearTimeout(pending);
    toast.textContent = ok ? successText : failureText;
    toast.dataset.result = ok ? "success" : "failure";
    toast.hidden = false;
    const timer = fakeWindow.setTimeout(() => {
      if (timers.get(toast) === timer) {
        toast.hidden = true;
        timers.delete(toast);
      }
    }, 3000);
    timers.set(toast, timer);
    return timer;
  }
  function fire(id) {
    const cb = scheduled.get(id);
    if (cb) {
      scheduled.delete(id);
      cb();
    }
  }
  return { show, fire, timers, scheduled };
}

test("Clipboard API success/failure propagates as an explicit boolean result", () => {
  const main = readSource("src/main.ts");
  // A: Clipboard API success resolves true.
  assert.match(main, /await navigator\.clipboard\.writeText\(text\)/);
  // B: Clipboard API rejection (or any throw) resolves false, never throws outward.
  assert.match(main, /catch \(error\) \{[\s\S]*?console\.error\("Clipboard copy failed"[\s\S]*?return false;/);
});

test("Legacy fallback reports the actual execCommand result (true -> success, false -> failure)", () => {
  const main = readSource("src/main.ts");
  // C+D root cause: the fallback must return the real boolean.
  assert.match(main, /return document\.execCommand\("copy"\)/);
  // Regression guard: the old unconditional `execCommand(...); ...; return true;` must be gone.
  assert.doesNotMatch(
    main,
    /document\.execCommand\("copy"\);\s*\n\s*textarea\.remove\(\);\s*\n\s*return true;/
  );
  // Cleanup still happens for both outcomes.
  assert.match(main, /try \{\s*\n\s*return document\.execCommand\("copy"\);\s*\n\s*\} finally \{\s*\n\s*textarea\.remove\(\);/);
});

test("Inspector affordance surfaces both success and failure (never silent)", () => {
  const main = readSource("src/main.ts");
  const html = readSource("index.html");
  assert.ok(html.includes("이 영역 검토하기"), "inspector button label must be preserved");
  assert.ok(main.includes("✓ 에이전트에게 전달할 내용이 복사되었습니다"), "inspector success text must be preserved");
  assert.ok(
    main.includes("⚠ 복사에 실패했습니다. 직접 선택해 복사해 주세요"),
    "inspector failure text must be visible"
  );
  // The result must fan out to both branches through the shared helper.
  assert.match(
    main,
    /const ok = await copyToClipboard\(text\);\s*\n\s*if \(copyToast\) \{\s*\n\s*showCopyFeedback\(\s*\n?\s*copyToast,\s*\n?\s*ok,/
  );
  // Old silent-failure gate must be gone from the inspector path.
  assert.doesNotMatch(main, /if \(await copyToClipboard\(text\) && copyToast\)/);
});

test("Current Focus affordance surfaces both success and failure (never silent)", () => {
  const main = readSource("src/main.ts");
  const html = readSource("index.html");
  assert.ok(html.includes("현재 집중 내용 복사"), "focus button label must be preserved");
  assert.ok(
    main.includes("✓ 에이전트에게 전달할 내용이 복사되었습니다"),
    "focus success text must be preserved"
  );
  assert.match(
    main,
    /const ok = await copyToClipboard\(text\);\s*\n\s*if \(toast\) \{\s*\n\s*showCopyFeedback\(\s*\n?\s*toast,\s*\n?\s*ok,/
  );
});

test("Ordinary clipboard guidance describes the action without naming the internal handoff component", () => {
  const main = readSource("src/main.ts");
  const html = readSource("index.html");
  assert.ok(
    html.includes("클릭하면 에이전트에게 전달할 검토 내용이 클립보드에 복사됩니다"),
    "inspector guidance must explain the user-visible action"
  );
  assert.ok(
    html.includes("✓ 에이전트에게 전달할 내용이 복사되었습니다"),
    "focus feedback must explain the user-visible result"
  );
  assert.doesNotMatch(html, /Problem Framer/, "ordinary HTML UI must not expose the internal component name");
  assert.doesNotMatch(html, /컨텍스트/, "ordinary HTML UI should describe purpose directly instead of jargon");
  assert.doesNotMatch(main, /✓ Problem Framer용 컨텍스트가 복사되었습니다/);
});

test("Feedback lifecycle reuses one common helper with per-toast timer coalescing", () => {
  const main = readSource("src/main.ts");
  // One shared helper for both affordances (minimum sufficient design, no toast framework).
  const showCalls = main.match(/showCopyFeedback\(/g) ?? [];
  assert.ok(showCalls.length >= 2, "both copy paths must reuse showCopyFeedback");
  // Per-toast pending-timer store.
  assert.match(main, /copyFeedbackTimers\s*=\s*new Map/);
  // New feedback cancels the previous timer before scheduling the next one.
  assert.match(main, /const pending = copyFeedbackTimers\.get\(toast\);\s*\n\s*if \(pending !== undefined\) clearTimeout\(pending\);/);
  // Stale timeout callbacks cannot clear newer feedback (identity guard).
  assert.match(main, /if \(copyFeedbackTimers\.get\(toast\) === timer\)/);
  // Render/entity transitions hide coherently without leaking a stale timer.
  assert.match(main, /function hideCopyFeedback\(/);
  assert.match(main, /if \(copyToast && entity\.kind !== "area"\) hideCopyFeedback\(copyToast\);/);
});

test("Repeated feedback use never lets an older timer clear newer feedback", () => {
  const { show, fire } = makeSimulatedFeedbackLoop();
  const toast = { hidden: true, textContent: "", dataset: {} };
  const first = show(toast, true, "ok-text", "fail-text");
  assert.equal(toast.hidden, false);
  assert.equal(toast.textContent, "ok-text");
  const second = show(toast, false, "ok-text", "fail-text");
  assert.equal(toast.textContent, "fail-text");
  // Firing the stale first timer must leave the newer feedback intact.
  fire(first);
  assert.equal(toast.hidden, false);
  assert.equal(toast.textContent, "fail-text");
  assert.equal(toast.dataset.result, "failure");
  // Firing the latest timer hides as normal.
  fire(second);
  assert.equal(toast.hidden, true);
});

test("Both feedback surfaces are accessible live regions with preserved structure", () => {
  const html = readSource("index.html");
  for (const id of ["copy-toast", "focus-copy-toast"]) {
    const idx = html.indexOf(`id="${id}"`);
    assert.ok(idx !== -1, `index.html must have #${id}`);
    const tagStart = html.lastIndexOf("<span", idx);
    const tagEnd = html.indexOf(">", idx);
    const tag = html.slice(tagStart, tagEnd + 1);
    assert.ok(tag.includes('role="status"'), `#${id} must expose role="status"`);
    assert.ok(tag.includes('aria-live="polite"'), `#${id} must expose aria-live="polite"`);
    assert.ok(tag.includes("hidden"), `#${id} must stay hidden until feedback shows`);
  }
  // Placement preserved: inspector toast inside .inspector-actions, focus toast inside #slot-focus.
  const inspectorToast = html.indexOf('id="copy-toast"');
  const inspectorActions = html.indexOf('class="inspector-actions"');
  assert.ok(inspectorActions < inspectorToast, "#copy-toast must stay inside .inspector-actions");
  const slotFocus = html.indexOf('id="slot-focus"');
  const focusToast = html.indexOf('id="focus-copy-toast"');
  const slotNow = html.indexOf('id="slot-now"');
  assert.ok(slotFocus < focusToast && focusToast < slotNow, "#focus-copy-toast must stay inside #slot-focus");
  // Visual language preserved: same elements, same button labels, failure styled via existing token.
  const css = readSource("src/style.css");
  assert.ok(css.includes(".copy-toast"), "CSS must keep the .copy-toast visual language");
  assert.match(css, /\.copy-toast\[data-result="failure"\]/);
  assert.ok(css.includes("--badge-remaining-ink"), "failure styling must reuse the existing failure token");
});
