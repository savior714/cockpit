import MarkdownIt from "markdown-it";
import type { Token } from "markdown-it";
import mermaid from "mermaid";
import "./style.css";

const md = new MarkdownIt({ html: false, linkify: true });

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: "neutral",
  flowchart: { useMaxWidth: false },
});

const HERE_MARKER = /^\s*%%\s*YOU\s+ARE\s+HERE\s*:\s*(\S+)/im;

/** Korean heading text → canonical English slot key used internally. */
const HEADING_ALIAS: Record<string, string> = {
  "프로젝트 지도": "project map",
  "지금 하는 일": "current frontier",
  "다음": "next",
  "막힌 것": "blocked",
  "프로젝트 큰 그림": "project frame",
  "이미 정해진 방향": "settled direction",
  "최근 완료": "recently completed",
};

function normalizeHeading(inner: Token[]): string {
  const raw = inner
    .filter((t) => t.type === "inline")
    .map((t) => t.content.trim().toLowerCase())
    .join(" ")
    .replace(/\s+/g, " ");
  return HEADING_ALIAS[raw] ?? raw;
}

/** Split top-level token stream into sections keyed by normalized h2 heading text. */
function splitSections(tokens: Token[]) {
  const sections = new Map<string, Token[]>();
  let title = "";
  let key: string | null = null;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.level === 0 && t.type === "heading_open" && t.tag === "h1") {
      if (!title) {
        title = tokens[i + 1]?.content.trim() ?? "";
        key = null;
      } else if (key) {
        key = `__h1:${normalizeHeading([tokens[i + 1]])}`;
        if (!sections.has(key)) sections.set(key, []);
      } else {
        i += 2;
        continue; // extra h1 before any h2 section: drop with its tokens
      }
      i += 2; // heading inline + close handled here
    } else if (t.level === 0 && t.type === "heading_open" && t.tag === "h2") {
      key = normalizeHeading([tokens[i + 1]]);
      if (!sections.has(key)) sections.set(key, []);
      i += 2;
    } else if (key) {
      sections.get(key)!.push(t);
    }
  }
  return { title, sections };
}

function renderTokens(tokens: Token[]): string {
  return md.renderer.render(tokens, md.options, {});
}

/** Render mermaid fences as placeholders; actual rendering happens after injection. */
function withMermaidPlaceholders(html: string): string {
  // markdown-it already emitted <pre><code class="language-mermaid">…</code></pre>
  return html.replace(
    /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g,
    (_m, src: string) => {
      const attr = src.replace(/"/g, "&quot;");
      return `<div class="mermaid" data-src="${attr}">${src}</div>`;
    }
  );
}

function setSection(panelId: string, tokens: Token[] | undefined) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const body = panel.querySelector<HTMLElement>(".panel-body");
  if (!body) return;
  const html = tokens ? withMermaidPlaceholders(renderTokens(tokens)) : "";
  body.innerHTML = html || `<p class="muted">아직 기록된 내용이 없습니다.</p>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function renderDoc(source: string) {
  const tokens = md.parse(source, {});
  const { title, sections } = splitSections(tokens);

  const byHeading = (name: string) => sections.get(name);

  document.title = title ? `${title} — Cockpit` : "Cockpit";
  document.getElementById("project-title")!.textContent = title || "이름 없는 프로젝트";

  setSection("slot-map", byHeading("project map"));
  setSection("slot-now", byHeading("current frontier"));
  setSection("slot-next", byHeading("next"));
  setSection("slot-blocked", byHeading("blocked"));
  setSection("slot-frame", byHeading("project frame"));
  setSection("slot-settled", byHeading("settled direction"));

  // Known presentation keys; everything else becomes secondary context.
  const known = new Set([
    "project map",
    "current frontier",
    "next",
    "blocked",
    "project frame",
    "settled direction",
  ]);
  const extra = document.getElementById("slot-extra")!;
  extra.innerHTML = "";
  let extrasShown = false;
  for (const [name, toks] of sections) {
    if (known.has(name)) continue;
    const heading = name.startsWith("__h") ? name.split(":", 2)[1] : name;
    const card = document.createElement("section");
    card.className = "panel panel-context";
    card.innerHTML = `<h2>${escapeHtml(heading)}</h2><div class="panel-body">${
      renderTokens(toks) || `<p class="muted">아직 기록된 내용이 없습니다.</p>`
    }</div>`;
    extra.appendChild(card);
    extrasShown = true;
  }
  extra.hidden = !extrasShown;

  const empty = document.getElementById("empty-state")!;
  const nothing = !title && sections.size === 0;
  empty.hidden = !nothing;

  // Render mermaid diagrams, then mark explicit YOU-ARE-HERE nodes.
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(".mermaid"));
  if (nodes.length) {
    try {
      await mermaid.run({ nodes, suppressErrors: true });
    } catch {
      /* per-diagram errors already surfaced inline by mermaid */
    }
  }

  const chip = document.getElementById("you-are-here-chip")!;
  chip.hidden = true;
  for (const el of nodes) {
    const src = el.getAttribute("data-src") ?? "";
    if (!el.closest("#slot-map")) continue;
    const marker = HERE_MARKER.exec(src);
    if (!marker) continue;
    const nodeId = marker[1];
    const g = document.querySelector<SVGGElement>(`#slot-map [id$="-flowchart-${nodeId}"], #slot-map [id*="-flowchart-${nodeId}-"]`);
    if (g) {
      g.classList.add("you-are-here");
      const label = g.querySelector(".nodeLabel")?.textContent?.trim();
      chip.textContent = `지금 여기 — ${label || nodeId}`;
      chip.hidden = false;
    }
  }
}

async function fetchAndRender() {
  try {
    const res = await fetch("/progress.md", { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const text = await res.text();
    await renderDoc(text);
  } catch (err) {
    document.title = "Cockpit — Unavailable";
    document.getElementById("project-title")!.textContent = "문서를 불러올 수 없습니다";
    const empty = document.getElementById("empty-state")!;
    empty.textContent = `진행 문서를 불러오지 못했습니다 (${err instanceof Error ? err.message : String(err)}).`;
    empty.hidden = false;
  }
}

function initLiveReload() {
  if (typeof EventSource === "undefined") return;
  const es = new EventSource("/events");
  es.addEventListener("change", () => {
    void fetchAndRender();
  });
}

void fetchAndRender();
initLiveReload();

