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
- Canvas media previews resolve managed task/upload media through the authenticated `/api/media-objects/:id/content` redirect endpoint instead of assuming stored media URLs are directly browser-readable.
- Image-generation nodes expose a single ordered image media input collection. If the collection is empty the task is text-to-image; if it has one or more images the task is image-to-image. Image-node UI does not split main/reference images, and image-task execution rejects `referenceImages` instead of migrating or merging them.
- Video-generation nodes may still use role-specific media slots such as `firstFrame`, `lastFrame`, `referenceImages`, `referenceAudios`, and `referenceVideos`.
- Workflow canvas styling follows `apps/web/DESIGN.md`: white/zinc surface tokens, glass floating UI, low-opacity ambient shadows, and no dark standalone composer theme.

## Verification
- `apps/api/src/modules/workflows/workflows.service.test.ts`
- `apps/api/src/modules/workflows/workflow-helpers.test.ts`
- `apps/api/src/modules/workflows/repositories/drizzle-workflow-repositories.integration.test.ts` (requires `MINA_POSTGRES_TEST_DATABASE_URL`)
- `bun --filter @mina/web typecheck`
- `bun --filter @mina/web build`
- `bun --filter @mina/api test ./src/modules/tasks/providers/model-specs.test.ts`
- `bun --filter @mina/api test ./src/modules/tasks/output/task-output-finalizer.test.ts`
