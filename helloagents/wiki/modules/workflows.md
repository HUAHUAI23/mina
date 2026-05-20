# Workflows Module

## Purpose
Persist canvas workflows and execute selected nodes or flow groups using stable ordered media slot semantics.

## Specification
- Workflow definitions are stored in normalized `workflows`, `workflow_nodes`, and `workflow_edges` rows; public DTOs still expose React Flow-compatible `nodes` and `edges`.
- Workflow runs are stored in `workflow_runs` plus immutable `workflow_run_nodes` / `workflow_run_edges` snapshots, row-level `workflow_run_node_states`, and `workflow_run_node_dependencies`.
- `workflow_runs` uses `next_reconcile_at`, `lease_until`, `leased_by`, and `lease_token` for scheduler ownership. Running runs are claimed with PostgreSQL row locking semantics before reconciliation.
- Executable node data may store `mediaSlots`.
- `WorkflowMediaResolver` resolves media object, external URL, current MediaView, and workflow run output sources.
- Ordinary canvas runs execute only the selected node; upstream node output is read from `mediaView`.
- Flow-group runs derive dependencies from node-output media slot sources and read upstream output from the current workflow run state.
- Workflow node task creation uses task idempotency keys and a unique workflow-run/node task link to prevent duplicate task side effects.
- Media edge validation ensures node-output slot items and media edges remain consistent.
- The web workflow canvas uses a TanStack Form-driven node composer for image/video `TaskDraftConfig` editing. Media inputs are represented by a `mediaSlots` form field group and remain persisted in node-owned `mediaSlots`; prompt/model/params are form state and are synced back to node config.
- Image/video canvas nodes are MediaView previews. Image nodes render the selected output image directly; video nodes render a poster by default and only mount video playback after explicit user interaction.
- The web image/video composer is rendered through React Flow `NodeToolbar` as a floating card below the selected MediaView node, not as a fixed bottom dock or node-internal card.
- The web media input section supports upload, paste, local media replacement, dnd-kit thumbnail drag ordering with React Flow event isolation, upstream MediaView missing-state display, flow-group run-output selector editing, and compact dashed upload wells in the composer.
- Workflow canvas graph edits use Yjs as the single source of truth. Zustand keeps UI/read projection state such as `nodes`, `edges`, dirty/saving flags, selection, panels, and render cache; graph mutation actions are thin commands that write the live Yjs document.
- Workflow canvas React Flow state is split into a render store and a Yjs-backed document projection. `onNodesChange` / `onEdgesChange` apply React Flow changes to `flowNodes` / `flowEdges`; drag stop diffs the captured baseline against final render frames and commits one Yjs node-frame transaction when positions changed.
- Flow projection is cached by node/edge id and stable signatures so single-node business changes reuse unrelated flow-node and flow-edge objects. Runtime callbacks are stored in a narrow runtime action store instead of being embedded in every React Flow node `data`.
- Canvas diagnostics expose development counters for node changes, edge changes, render writes, document commits, autosave starts, websocket reconnects, Yjs update traffic, and React Profiler commits. Performance fixtures cover 20, 100, and 500-node canvases, with Chromium traces stored under the workflow-canvas performance refactor history package.
- Development-only canvas render counts are exposed per node and covered by Playwright so drag frames can prove unrelated visible nodes are not rerendering.
- The collaboration path stores graph data in a Yjs document with `nodes`, `nodeFrames`, `nodeOrder`, `edges`, `edgeOrder`, and `meta`, plus awareness fields for user, cursor, viewport, selection, and dragging. Node frame state is split from node config data so stale config updates do not overwrite newer collaborative positions. Remote Yjs updates are projected one-way into the Zustand/render stores; runtime code does not import a server plain snapshot back into an existing client ydoc.
- Autosave and manual save call `POST /api/workflows/:id/collab/checkpoint` with `{ name? }`; the server validates and compacts its authoritative room ydoc, returns the server `yjsStateVector`, and refreshes `workflows.nodes/edges` as a read model. The frontend no longer has collaboration mode flags, no longer uploads full `nodes`/`edges` through REST `PUT`, no longer sends `stateUpdate` in checkpoint requests, and only acknowledges saved state when the local Yjs state vector matches the checkpoint response.
- The API exposes `GET /api/workflows/:id/collab/snapshot` for diagnostics/initialization, `POST /api/workflows/:id/collab/checkpoint` for server-side validation/compaction/read-model refresh, and `WS /api/workflows/:id/collab/:room` as the live sync channel. The WebSocket route authenticates and authorizes workflow access, enforces room/workflow id matching, persists Yjs updates before broadcast, broadcasts to peers without echoing the sender, compacts update streams into snapshots, and restores room state from persisted snapshots/updates after restart.
- Client graph commands perform a local dry-run plus graph validation before mutating the live ydoc. The server does not clone and validate the full graph on every Yjs update; it validates the exported graph during checkpoint/read-model refresh, so high-frequency collaboration remains bounded while invalid graphs cannot be compacted into the workflow read model.
- Collaboration checkpoint compaction and workflow read-model replacement are serialized per workflow id. Workflow run creation first checkpoints the authoritative server ydoc so execution snapshots consume the latest collaborative graph.
- Collaboration persistence uses `workflow_yjs_updates` for binary Yjs updates and `workflow_yjs_snapshots` for compacted state vectors/snapshots. During active development the project uses `bun --filter @mina/api db:push`; the current development database has been synced with `bun --filter @mina/api db:push -- --force`, and a follow-up `bun --filter @mina/api db:push -- --explain` reports no pending schema changes.
- Canvas media previews resolve managed task/upload media through the authenticated `/api/media-objects/:id/content` redirect endpoint instead of assuming stored media URLs are directly browser-readable.
- Image-generation nodes expose a single ordered image media input collection. If the collection is empty the task is text-to-image; if it has one or more images the task is image-to-image. Image-node UI does not split main/reference images, and image-task execution rejects `referenceImages` instead of migrating or merging them.
- Video-generation nodes may still use role-specific media slots such as `firstFrame`, `lastFrame`, `referenceImages`, `referenceAudios`, and `referenceVideos`. Video canvas nodes render poster-only previews in normal canvas nodes and do not mount playable `<video>` elements there.
- Workflow canvas styling follows `apps/web/DESIGN.md`: white/zinc surface tokens, glass floating UI, low-opacity ambient shadows, and no dark standalone composer theme.

## Verification
- `apps/api/src/modules/workflows/workflows.service.test.ts`
- `apps/api/src/modules/workflows/workflow-helpers.test.ts`
- `apps/api/src/modules/workflows/repositories/drizzle-workflow-repositories.integration.test.ts` (requires `MINA_POSTGRES_TEST_DATABASE_URL`)
- `bun --filter @mina/web typecheck`
- `bun test apps/web/src/features/workflow-canvas/render/drag-session.spec.ts`
- `bun test apps/web/src/features/workflow-canvas/render/flow-projection-cache.spec.ts`
- `bun test apps/web/src/features/workflow-canvas/sync/yjs/yjs-document.spec.ts apps/web/src/features/workflow-canvas/render/flow-render-store.spec.ts apps/web/src/features/workflow-canvas/store/remote-drag-reconciliation.spec.ts`
- `bun test apps/web/src/features/workflow-canvas/utils/performance-fixture.spec.ts`
- `bun test apps/web/src/features/workflow-canvas/utils/react-flow-persistence.spec.ts`
- `bun test apps/web/src/features/workflow-canvas/store/canvas-ui-store.spec.ts`
- `bun run test:e2e tests/workflow-canvas.spec.ts`
- `bun tests/scripts/workflow-canvas-performance-evidence.ts`
- `bun test apps/api/src/modules/workflows/collaboration/workflow-yjs-room.service.test.ts`
- `bun test apps/api/src/modules/workflows/workflow-collaboration.routes.test.ts`
- `bun --filter @mina/web build`
- `bun --filter @mina/api typecheck`
- `bun --filter @mina/api build`
- `bun --filter @mina/api db:push -- --explain`
- `bun --filter @mina/api test ./src/modules/tasks/providers/model-specs.test.ts`
- `bun --filter @mina/api test ./src/modules/tasks/output/task-output-finalizer.test.ts`

## Change History
- `helloagents/history/2026-05/202605201040_workflow_canvas_yjs_ssot/` - Replaced workflow canvas shadow/full-save collaboration with Yjs SSOT graph commands, one-way projection, server checkpoint validation/compaction/read-model refresh, and state-vector save acknowledgement.
