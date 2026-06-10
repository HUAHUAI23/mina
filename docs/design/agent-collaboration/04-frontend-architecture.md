# 04 — Frontend Architecture

Follows the feature-folder rules: transport in `features/*/api`,
server state in hooks, UI text through `useMessages()`, Tailwind-first
styling, no presigned URLs in state, canvas SSOT stays the Yjs doc.

## 1. Feature map

```text
apps/web/src/features/workflow-canvas/agent-chat/   # existing, extended
  api/                       # + chainKey on message create, plan fetch
  components/
    chain-picker.tsx         # composer chips bound to GET /api/agent/chains
    plan-card.tsx            # assistant 'plan' part renderer
    plan-item-row.tsx        # per-shot status, adjustments, blocked refs
    run-phase-progress.tsx   # chat.run.phase live progress
    document-part.tsx        # 'document' part with "produce video" action
    asset-changes-part.tsx   # 'asset_changes' part summary
  domain/                    # part type guards, plan view models
  plan/
    insert-plan.ts           # PlanGraph -> ydoc commands (THE inserter)
    plan-layout.ts           # group/standalone position resolution
    plan-insert-report.ts    # inserted/skipped/blocked summary for toasts
  store/                     # existing chat store + run phase state

apps/web/src/features/story-assets/
  api/story-assets.ts
  hooks/use-story-assets.ts
  components/
    story-asset-board.tsx    # card grid grouped by character/scene/prop
    story-asset-card.tsx     # primary image, name, image count, voice badge
    story-asset-detail.tsx   # image wall, role/primary controls, voice list
    story-asset-create-dialog.tsx

apps/web/src/features/agent-settings/
  api/
  components/
    generation-profile-form.tsx   # image + video defaults, model pickers
    prompt-module-editor.tsx      # list (enable/sort/delete) + markdown editor
    prompt-preview-panel.tsx      # read-only assembled prompt
```

Routes:

- `/projects/$projectId/story-assets` — story asset board (tab beside
  the project's canvas list). Canvas-side quick access: a side panel in
  the workflow editor opens the same board components scoped to the
  canvas's project.
- `/settings/agent` — generation profile + per-chain prompt modules.

## 2. Plan insertion (the critical path)

The canvas SSOT is the Yjs document; UI commands mutate the ydoc
directly in `'mina-local'` transactions (collaboration design rules).
Plan insertion therefore:

1. Fetches/holds the `PlanGraph` from the plan part.
2. Resolves positions: per-item `flow_group` containers sized from
   child counts; collision-free placement against current nodes in the
   viewport (reuse existing canvas layout helpers; deterministic grid
   fallback).
3. Maps plan keys to fresh node ids.
4. Builds canvas nodes per contracts:
   - `nodeType` from `PlanNode.nodeType`; `data.title`;
     `data.config.task` from `taskDraft` **merged with the latest
     generation profile** at insert time (profile may have changed
     since planning; planning-time values win for prompt-coupled
     fields like duration/mode, profile wins for model identity —
     mismatches surface as a notice in the insert report);
   - `data.mediaSlots` from `PlanMediaSlotItem[]`:
     `media_object` sources as-is; `plan_node_output` becomes
     `node_output/run_output` inside a `flow_group` and
     `node_output/current_media` for standalone pairs;
     `placeholder` becomes an empty slot item flagged for the user;
   - prompt mention map stored with the node's prompt UI state so the
     slot-to-token binding renders in the node editor.
5. Builds visual media edges from `PlanEdge[]` (projection only;
   execution dependencies already live in mediaSlots sources).
6. Applies **everything in one Yjs transaction** so collaborative
   peers receive one update and undo reverts the whole insertion as
   one step (`Y.UndoManager` requirement from the collaboration
   design).
7. Returns an insert report: created node ids, skipped items (e.g.
   reference count exceeding the *currently selected* model's limit),
   blocked placeholders — surfaced as toasts and plan-card badges.

Partial insertion: the plan card lets the user insert all items or a
single item (per-shot button). Filtering happens on PlanGraph items
before step 2; id mapping keeps edges/slots internally consistent.

## 3. Plan card UX

The assistant message renders the `plan` part as a card:

- header: chain name, item counts (planned/blocked/failed), plan
  status badge;
- per-item rows: title, duration, compiled mode, adjustment chips
  (`mode_fallback`, `reference_cap_truncated`, …), blocked asset names;
- actions: `Insert all`, per-item `Insert`, `View prompt` (final
  rendered prompt with mention highlighting);
- the card stays functional from history (plan fetched by id), so
  insertion is repeatable across sessions and canvases sharing the
  project.

`document` parts (storyboard chain output) render with a
`Produce videos` action that pre-fills the composer with the document
and the `production.storyboard_to_video` chain selected — the
composability seam between writing and production.

## 4. Generation profile as canvas default

`generation-profile-form.tsx` edits the account/project profile.
Manual node creation on the canvas reads the same resolved profile
(project → account → code default) through one shared hook
`useGenerationProfile(projectId)` and applies it to new
`image_generation` / `video_generation` node `taskDraft` defaults.
One source; the AI compiler and the canvas never diverge.

## 5. Story asset board UX

- Grid of cards grouped by type (characters / scenes / props), project
  scoped, search by name.
- Card: primary image (via `MediaImage` stable content URLs), name,
  ref key (copyable, shown as code), image count, voice badge.
- Detail: image wall with role + primary toggles, upload (purpose
  `story_asset`) or pick-from-asset-library (reuses `mediaObjectId`),
  voice list with audio preview, description editor.
- Chat integration: `assets.curation` results deep-link here; the
  manifest the AI sees is exactly what this board manages.

## 6. i18n & styling notes

- All new UI copy through `useMessages()` with semantic keys
  (`agent_chat_plan_insert_all`, `story_asset_board_title`, …), both
  catalogs updated in the same change, `bun run i18n:compile` in
  affected scripts.
- Compiled prompt text and asset names are user/AI data — rendered
  verbatim, never translated.
- Plan card and boards reuse card-grid patterns from projects/assets
  routes; no backdrop-filter/blur effects (performance rules).
- Composer chips and plan cards inside the canvas overlay must keep
  `nodrag nowheel nopan` + `data-mina-canvas-ignore` semantics.
