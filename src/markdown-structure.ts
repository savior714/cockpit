/**
 * Markdown structural layer: sole owner for markdown-it mechanics.
 *
 * Owns the MarkdownIt instance/configuration, token traversal, heading
 * normalization at the syntax boundary, top-level section splitting,
 * heading/list/block structural extraction, and source/raw-text extraction
 * needed by upper layers. Semantic interpretation lives in
 * `./semantic-construction.js`; view rendering composes on strings via
 * `renderMarkdownString`, never by traversing Tokens outside this module
 * and the compatibility facade.
 */

import MarkdownIt from "markdown-it";
import type { Token } from "markdown-it";
import { HEADING_ALIAS } from "./authoring-grammar.js";

export type { Token };

export const md = new MarkdownIt({ html: true, linkify: true });

export function normalizeHeading(tokens: Token[]): string {
  const raw = tokens
    .filter((t) => t.type === "inline")
    .map((t) => t.content.trim().toLowerCase())
    .join(" ")
    .replace(/\s+/g, " ");
  return HEADING_ALIAS[raw] ?? raw;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderTokens(tokens: Token[]): string {
  return md.renderer.render(tokens, md.options, {});
}

export function withMermaidPlaceholders(html: string): string {
  return html.replace(
    /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g,
    (_m, src: string) => {
      const attr = src.replace(/"/g, "&quot;");
      return `<div class="mermaid" data-src="${attr}">${src}</div>`;
    }
  );
}

/** Render a markdown source string to HTML (with mermaid placeholders). */
export function renderMarkdownString(markdown: string): string {
  if (!markdown.trim()) return "";
  return withMermaidPlaceholders(renderTokens(md.parse(markdown, {})));
}

/** Split top-level token stream into sections keyed by normalized h2 heading text. */
export function splitSections(tokens: Token[]) {
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
        continue;
      }
      i += 2;
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

export interface HeadingBlock {
  title: string;
  tokens: Token[];
}

export function parseHeadingBlocks(tokens?: Token[], tag: "h3" | "h4" = "h3"): HeadingBlock[] {
  const blocks: HeadingBlock[] = [];
  if (!tokens || tokens.length === 0) return blocks;

  let current: HeadingBlock | null = null;
  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === "heading_open" && token.tag === tag) {
      flush();
      current = {
        title: tokens[i + 1]?.content.trim() ?? "",
        tokens: [],
      };
      i += 2;
    } else if (current) {
      current.tokens.push(token);
    }
  }
  flush();
  return blocks;
}

/** Extract clean plain text representation preserving lists, paragraphs, and fenced blocks. */
export function extractSectionRawText(tokens?: Token[]): string {
  if (!tokens || tokens.length === 0) return "";
  const lines: string[] = [];
  let inBulletList = false;
  let inOrderedList = false;
  let orderIndex = 1;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "bullet_list_open") {
      inBulletList = true;
    } else if (t.type === "bullet_list_close") {
      inBulletList = false;
    } else if (t.type === "ordered_list_open") {
      inOrderedList = true;
      orderIndex = 1;
    } else if (t.type === "ordered_list_close") {
      inOrderedList = false;
    } else if (t.type === "list_item_open") {
      if (t.info) {
        orderIndex = parseInt(t.info, 10) || orderIndex;
      }
    } else if (t.type === "fence" || t.type === "code_block") {
      const info = (t.info ?? "").trim();
      const content = (t.content ?? "").replace(/\s+$/, "");
      if (content) {
        lines.push(info ? `\`\`\`${info}\n${content}\n\`\`\`` : `\`\`\`\n${content}\n\`\`\``);
      }
    } else if (t.type === "inline" && t.content.trim()) {
      const content = t.content.trim();
      if (inOrderedList) {
        lines.push(`${orderIndex}. ${content}`);
        orderIndex++;
      } else if (inBulletList) {
        lines.push(`- ${content}`);
      } else {
        lines.push(content);
      }
    }
  }

  return lines.join("\n").trim();
}
