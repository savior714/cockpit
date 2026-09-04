import { defineConfig } from "vite";

// Build-graph stability: keep Vite's dynamic-import runtime
// (`\0vite/preload-helper.js`, emitted as `__vitePreload`) in its own
// stable chunk instead of the application entry chunk. By default Rollup
// places code shared between the entry and dynamic chunks in the entry,
// so every Mermaid vendor/diagram chunk statically imported the app entry
// for that helper and any app-only change cascaded through the whole
// vendor graph. Isolating the helper removes the last vendor -> entry
// edge; the Mermaid graph is then owned by `mermaid.core-*` while the app
// entry only holds a dynamic edge to it. No content hashing is disabled
// and no filenames are pinned.
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("vite/preload-helper")) {
            return "preload-helper";
          }
          return undefined;
        },
      },
    },
  },
});
