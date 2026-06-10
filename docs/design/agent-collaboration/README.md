# Agent Collaboration System: Design & Implementation Plan

This directory is the complete design record and implementation plan for
Mina's AI collaboration system: typed agent chains that turn chat input
into creative documents, curated story assets, and executable canvas
node plans.

The design is informed by a full reading of the predecessor project
Lumina (`temp/lumina`, written by the same author). Lumina is a
**reference only** — no code is imported from it. Its deterministic
compile layer is the part worth keeping; its schema-constrained
multi-call planning layer is the part being replaced.

## Core Principle

> Freedom in the creative layer, determinism in the compile layer.

The LLM writes free-form creative text (storyboards, shot prompts,
dialogue) and references project assets by **stable IDs**
(`@img_…`, `@voice_…`). A deterministic compiler then parses those
references, packs media slots in order of appearance, enforces model
capability limits, renders locale-correct reference tokens
(`图1` / `image1`), hydrates model defaults from the generation
profile, and emits a plan graph that inserts into the canvas as
ready-to-run nodes.

Structure exists in exactly two places — the thin output protocol
(parseability) and the compiler (executability). Everything between is
the model's creative space.

Compared to Lumina this replaces 2–3 JSON-schema-constrained LLM calls
per shot with **one free-prose call per shot** plus an optional repair
round, deletes the three-layer intermediate representation
(shotSpec / shotPlan / promptPackage), and collapses the per-path code
strategy plugins into pluggable prompt modules.

## What Is Being Built

1. **Story assets** — project-scoped characters, scenes, and props,
   each with reference images and (for characters) voice references,
   maintained from chat or a management UI, exposed to the LLM as a
   compact manifest with stable ref keys.
2. **Agent chains** — a typed catalog of AI capabilities grouped into
   four families: conversation, writing (novel / screenplay /
   storyboard), asset curation, and production (single shot,
   storyboard-to-video).
3. **Prompt assembly** — three fixed layers per chain: built-in system
   protocol, user-editable pluggable prompt modules, built-in output
   protocol.
4. **The compiler** — reference grammar parsing, slot packing,
   capability caps, fallback, locale token rendering, plan-graph
   building.
5. **Plan graph insertion** — a contracts-level `PlanGraph` IR that the
   web canvas inserts as one undoable Yjs transaction.
6. **Generation profile** — one account/project-level default model
   configuration consumed by both the compiler and manual canvas node
   creation.

## Reading Order

| # | File | Contents |
|---|------|----------|
| 1 | [`01-domain-model.md`](./01-domain-model.md) | Chain taxonomy, reference grammar, output protocols, compile semantics, the PlanGraph IR, worked example |
| 2 | [`02-data-model.md`](./02-data-model.md) | New tables, altered tables, column-level definitions, naming rationale, indexes |
| 3 | [`03-backend-architecture.md`](./03-backend-architecture.md) | API module layout, layering, prompt assembly, run orchestration over `chat_assistant_runs`, events |
| 4 | [`04-frontend-architecture.md`](./04-frontend-architecture.md) | Web feature layout, plan card, Yjs insertion, story asset UI, settings UI |
| 5 | [`05-implementation-plan.md`](./05-implementation-plan.md) | Ordered milestones with entry/exit criteria and verification commands |

## Fixed Decisions (do not relitigate during implementation)

- The canvas source of truth stays the Yjs document. Plan insertion is
  a **client-side** ydoc mutation in a single `'mina-local'`
  transaction; the server never writes nodes into a canvas.
- Chain execution rides the existing durable `chat_assistant_runs`
  machinery (queued/claimed/retryable, scheduler-recovered). No second
  run table.
- The LLM never sees positional media tokens. Stable ref IDs in, locale
  tokens out — token rendering is a compiler concern.
- System protocol and output protocol prompts are code-built-ins and
  not user-editable. Only the middle pluggable modules are.
- Story assets reference `media_objects` directly (same rule as the
  asset library: business index over managed media, never a second
  file identity).
- Model capability limits (reference image counts, duration sets) are
  read from task `ModelRegistry` model specs — never duplicated into
  agent code.
- All Lumina behaviors arrive re-implemented against Mina contracts.
  `temp/lumina` must never be imported.

## Glossary

| Term | Meaning |
|------|---------|
| chain | One typed AI capability (key, context needs, prompt parts, result kind) |
| chain family | `conversation` / `writing` / `assets` / `production` |
| story asset | A project-scoped character, scene, or prop with images and voices |
| manifest | The compact asset listing injected into chain prompts |
| ref key | Stable LLM-facing ID: `char_lihua`, `img_a1b2`, `voice_c3d4`, `upload_1` |
| envelope | The thin parseable header of a chain output (`#shot`, `duration:`) |
| compile | Deterministic transform: creative text → PlanGraph |
| PlanGraph | Contracts-level IR describing nodes/slots/edges to insert |
| plan item | One shot (or one single production) inside a persisted plan |
| generation profile | Account/project default image & video model configuration |
| adjustment | A recorded deterministic change the compiler made (fallback, cap, clamp) |
| blocked | A plan item missing required assets; compiled with placeholders, not failed |
