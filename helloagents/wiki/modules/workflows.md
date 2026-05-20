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
- Canvas edits are held in a Zustand draft store and are debounced into workflow definition saves, while selection/config panel state lives in a separate UI store. Local media slot changes persist before refresh without waiting for a node run, and save acknowledgement uses draft revisions instead of overwriting the local draft.
- Workflow canvas React Flow state is split into a render store and a document draft store. `onNodesChange` / `onEdgesChange` always apply React Flow changes to `flowNodes` / `flowEdges`; drag frames do not touch persisted workflow nodes or draft revisions. Drag stop diffs the captured baseline against final render frames and commits one document transaction when positions changed.
- Flow projection is cached by node/edge id and stable signatures so single-node business changes reuse unrelated flow-node and flow-edge objects. Runtime callbacks are stored in a narrow runtime action store instead of being embedded in every React Flow node `data`.
- Canvas diagnostics expose development counters for node changes, edge changes, render writes, document commits, autosave starts, websocket reconnects, Yjs update traffic, and React Profiler commits. Performance fixtures cover 20, 100, and 500-node canvases, with Chromium traces stored under the workflow-canvas performance refactor history package.
- Development-only canvas render counts are exposed per node and covered by Playwright so drag frames can prove unrelated visible nodes are not rerendering.
- The collaboration path now has a Yjs document with `nodes`, `nodeOrder`, `edges`, `edgeOrder`, and `meta`, plus awareness fields for user, cursor, viewport, selection, and dragging. Local document transactions are recorded in the canvas store and mapped into Yjs transactions; remote Yjs updates export a snapshot back into the document/render path. `VITE_WORKFLOW_CANVAS_SYNC_MODE=primary` hydrates from the collaboration snapshot as the primary graph source, while `shadow` and `disabled` modes preserve rollback choices; REST snapshot save remains the compatible save/export fallback path.
- The API exposes `GET /api/workflows/:id/collab/snapshot` and `WS /api/workflows/:id/collab/:room`. The WebSocket route authenticates and authorizes workflow access, enforces room/workflow id matching, handles the y-websocket sync/awareness protocol, persists incoming Yjs updates, compacts update streams into snapshots, and restores room state from persisted snapshots/updates after restart.
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
- `bun test apps/web/src/features/workflow-canvas/sync/yjs/yjs-document.spec.ts`
- `bun test apps/web/src/features/workflow-canvas/utils/performance-fixture.spec.ts`
- `bun test apps/web/src/features/workflow-canvas/utils/react-flow-persistence.spec.ts`
- `bun test apps/web/src/features/workflow-canvas/store/document-transactions.spec.ts`
- `bun test apps/web/src/features/workflow-canvas/store/remote-drag-reconciliation.spec.ts`
- `bun run test:e2e -- tests/workflow-canvas.spec.ts --project=chromium` (covers primary collaboration snapshot hydration)
- `bun tests/scripts/workflow-canvas-performance-evidence.ts`
- `bun test apps/api/src/modules/workflows/collaboration/workflow-yjs-room.service.test.ts`
- `bun test apps/api/src/modules/workflows/workflow-collaboration.routes.test.ts`
- `bun --filter @mina/web build`
- `bun --filter @mina/api typecheck`
- `bun --filter @mina/api build`
- `bun --filter @mina/api db:push -- --explain`
- `bun --filter @mina/api test ./src/modules/tasks/providers/model-specs.test.ts`
- `bun --filter @mina/api test ./src/modules/tasks/output/task-output-finalizer.test.ts`
