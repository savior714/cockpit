# Cockpit — Mental Model Acceptance Snapshot

> Frozen self-dogfood-style fixture. It models Cockpit concerns and is not EMR data.

## Current Situation

Cockpit is a deterministic, read-only viewer that has established project-model fidelity. The map is the mental anchor again: a reader sees the structure and current position first, then the current state, the nearest transition, and any material constraint — without learning a Cockpit-specific ontology.

## Next Transition

Contracted Map-first viewer → independently accepted reader comprehension. The transition closes when a context-free reader can restore the project purpose, structure, position, next step, and constraint from the primary surface alone.

## Facing Issues

- **Independent reader proof** — the fixture-level boundary is established, but fresh-reader acceptance on the contracted viewer is still the open verification.

## Recent Progress

- **Product contraction** → Horizon/Stage/Posture/Frontier/Thread/Movement dual owners and the execution/publication handoff vocabulary were removed; one plain-text owner per reader question remains.
- **Map-first restoration** → the project map renders first as the structural anchor; orientation follows as plain 지금/다음/막힘 sections.
- **Handoff convergence** → Problem Framer handoff carries project context only and defers execution mechanics to the repository contract.

## Project Map

### Viewer capability trajectory
#### Foundation
- **Core viewer runtime** — Local read-only rendering
- **Model parser** — Human-readable semantic parsing

#### Current Stage
- **Reader-facing renderer** — Map-first orientation projection
- **Area inspector** — Shared drill-down shell

#### Future
1. **Portable package** — Broader installation and adoption
2. **Independent comprehension proof** — Fresh-reader acceptance

## Area Details

### Core viewer runtime
#### Meaning
The local read-only browser and loopback serving path.
#### Current Level
Strong and deterministic in the fixture.
#### Evidence
- Single-document serving with live reload re-renders the same document.

### Model parser
#### Meaning
The parser that translates ordinary Markdown sections into the displayable project model.
#### Current Level
Strong for the contracted section set: map, area details, and plain-text overview sections.
#### Evidence
- Map ↔ Area Detail correspondence is checked deterministically.

### Reader-facing renderer
#### Meaning
The Map-first projection that gives a cold reader the project meaning before the area detail.
#### Current Level
Contracted to plain-text orientation; independent comprehension is the open proof.
#### Evidence
- Primary surface restores purpose, structure, position, next, and constraint without taxonomy study.

### Area inspector
#### Meaning
One contextual shell for drilling from an area into its evidence.
#### Current Level
Implemented as a shared navigation surface for areas and evidence depth.
#### Evidence
- Map cards open areas; evidence buttons open evidence depth.

### Portable package
#### Meaning
The installable local package and runtime boundary that can be used by another project.
#### Current Level
Partial adoption readiness.
#### Evidence
- Package and loopback boundary verified; broader adoption still to be shown.

### Independent comprehension proof
#### Meaning
An independent reader observation of the rendered model without repository context.
#### Current Level
Defined as the next acceptance boundary; not yet performed on the contracted viewer.
#### Evidence
- The Next Transition above names this exact transition.

## Product Goal

Cockpit shows a project's structure, current state, and nearest transition to a first-time reader through one human-readable PROGRESS.md rendered deterministically in a local read-only viewer.
