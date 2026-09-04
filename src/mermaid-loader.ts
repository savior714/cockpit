/**
 * Mermaid loading boundary.
 *
 * Sole owner for Mermaid runtime acquisition and initialization. The
 * application entry (`./main.js`) never statically imports `mermaid`;
 * it reaches this module only, and this module reaches `mermaid` through
 * a dynamic `import()` so the bundler places the Mermaid vendor graph
 * (core + diagram-specific dynamic chunks) under its own chunk owner
 * instead of the application entry chunk.
 *
 * Initialization semantics are preserved exactly: `startOnLoad: false`,
 * `securityLevel: "strict"`, `theme: "neutral"`, and
 * `flowchart.useMaxWidth: false`, applied once before the first render.
 * Rendering semantics are preserved: `run()` over the provided `.mermaid`
 * nodes with `suppressErrors: true`; Mermaid owns its own render errors.
 */

type MermaidModule = typeof import("mermaid");

let initialized = false;
let pendingLoad: Promise<MermaidModule> | null = null;

function loadMermaid(): Promise<MermaidModule> {
  if (!pendingLoad) {
    pendingLoad = import("mermaid").then((mod) => {
      if (!initialized) {
        mod.default.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "neutral",
          flowchart: { useMaxWidth: false },
        });
        initialized = true;
      }
      return mod;
    }).catch((error) => {
      pendingLoad = null;
      throw error;
    });
  }
  return pendingLoad;
}

export async function renderMermaidDiagrams(nodes: HTMLElement[]): Promise<void> {
  if (nodes.length === 0) return;
  try {
    const mermaid = await loadMermaid();
    await mermaid.default.run({ nodes, suppressErrors: true });
  } catch {
    /* Mermaid owns its own render errors. */
  }
}
