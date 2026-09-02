# Cockpit

A local-first project dashboard that renders a single `PROGRESS.md` file into a live, map-centric UI. Write your project status in plain Markdown; Cockpit turns it into an interactive dashboard with Mermaid flowcharts, a "You Are Here" indicator, and auto-refresh on every save.

## Quick Start

```bash
npm install
npm run build
npm run cockpit -- /path/to/your/PROGRESS.md
# → open http://127.0.0.1:4321
```

The viewer watches the file for changes and live-reloads the page automatically via Server-Sent Events — no manual refresh needed.

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Vite dev server (for working on Cockpit itself) |
| `npm run build` | Type-check + production build into `dist/` |
| `npm run preview` | Preview the production build |
| `npm run cockpit -- <file>` | Serve the viewer against a progress file |

### CLI Options

```
cockpit <path/to/PROGRESS.md> [--port <n>]
```

- `--port`, `-p` — port to listen on (default `4321`)
- The server binds to `127.0.0.1` only (loopback, read-only).

## PROGRESS.md Format

Cockpit expects a Markdown file structured with these `## h2` sections:

| Section | Panel | Purpose |
|---|---|---|
| `## Project Map` | Main map | Mermaid flowchart showing project stages |
| `## Current Frontier` | Now | What you're working on right now |
| `## Next` | Next | Upcoming work items |
| `## Blocked` | Blocked | Blockers and external dependencies |
| `## Project Frame` | Project Frame | High-level success criteria |
| `## Settled Direction` | Settled Direction | Architectural decisions already locked in |

Any additional `## h2` sections are rendered as extra context cards at the bottom of the dashboard.

### You Are Here Marker

Inside a Mermaid block in `## Project Map`, add a comment to highlight the current node:

```mermaid
flowchart TD
    A[Ingestion] --> B[Normalization]
    B --> C{Validation}
    C --> D[Enrichment]

    %% YOU ARE HERE: C
```

The node matching the ID (`C` in the example) gets a pulsing accent highlight and a header chip.

## Project Structure

```
cockpit/
├── index.html           # HTML shell with semantic slot layout
├── src/
│   ├── main.ts          # Markdown parsing, section routing, Mermaid rendering
│   └── style.css        # Responsive grid layout, dark mode, "You Are Here" animation
├── scripts/
│   └── serve.mjs        # Loopback HTTP server + SSE file watcher
├── docs/operations/
│   ├── DEVELOPMENT.md   # Development execution contract
│   └── TESTING.md       # Evidence/validation semantics
├── package.json
└── tsconfig.json
```

## Tech Stack

- **TypeScript** + **Vite** — build and dev tooling
- **markdown-it** — Markdown → token stream → HTML
- **Mermaid** — flowchart/diagram rendering
- Vanilla CSS with CSS custom properties, light/dark mode, responsive grid

## License

Private.
