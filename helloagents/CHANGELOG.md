# Changelog

This file records important project changes.

## [Unreleased]

### Added
- Added a weighted workflow-canvas React Flow performance policy and regression check so media-heavy canvases enable visible-element rendering earlier than small canvases.
- Added `public_library` media-object upload purpose with admin-only enforcement for direct and presigned uploads.
- Added workflow canvas Yjs single-source collaboration runtime with a live document registry, direct graph command layer with dry-run validation, one-way Zustand projection, server-side checkpoint validation/compaction/read-model refresh, per-workflow checkpoint locking, and state-vector checkpoint acknowledgements.
- Added workflow canvas render-state separation, projection cache, drag-session diagnostics, 20/100/500-node performance fixtures, and Yjs document mapping with snapshot parity checks.
- Added Playwright workflow canvas regression coverage for drag/save/reload, selection drag, save failure retry, Yjs parity, 500-node visible-element clipping, and drag-time unrelated-node render counts.
- Added automated workflow canvas performance evidence generation with Chromium trace files and React Profiler commit summaries for 20/100/500-node fixtures.
- Added an authenticated workflow collaboration snapshot endpoint and y-websocket-compatible collaboration room with Yjs update persistence, snapshot compaction, awareness broadcast, and restart recovery tests.
- Added workflow Yjs persistence tables for binary updates and compacted snapshots, plus Drizzle schema explain coverage for the generated table/index/foreign-key SQL.
- Added an authenticated media-object content redirect endpoint and workflow preview URL resolver so canvas previews can render managed media even when storage objects are private or stored as `s3://` URLs.
- Added dnd-kit-powered drag sorting for workflow media slot thumbnails.
- Added a TanStack Form-driven workflow node composer for image/video generation configuration, including shared prompt state and model descriptor-based parameter rendering.
- Added workflow media slot UI support for paste/upload input, local media replacement, slot ordering, upstream MediaView missing-state display, and flow-group output selector controls.
- Added the web password login/register auth gate, typed auth API client, local development session persistence, and app-shell logout/profile integration.
- Added web `/projects` and `/canvas` route pages derived from the static UI mockups and adapted to the shared app shell.
- Added `db:create`, `db:drop`, and `db:migration:test` commands for testing the full Drizzle generate/migrate workflow from a recreated development database.
- Added a standard `db:reset:push` command that drops Mina-owned development tables and immediately re-syncs the Drizzle schema.
- Added a development-only Drizzle `db:push` workflow for syncing schema changes without writing migration files.
- Added managed media objects, media object persistence, storage usage aggregation, and account-scoped media storage keys.
- Added workflow `mediaSlots` contracts and backend resolution for media objects, external URLs, current MediaView outputs, and current workflow-run outputs.
- Added task output finalization so provider outputs are mirrored into Mina-managed media objects before task success is persisted.
- Added normalized workflow definition/run storage tables and scheduler lease fields for multi-replica workflow reconciliation.
- Added task idempotency keys for workflow-created node task retries.
- Added opt-in PostgreSQL-backed workflow repository concurrency tests for run claiming, leases, node state predicates, and duplicate node starts.

### Changed
- Reworked workflow storage so Yjs update logs and snapshots are the editable graph source of truth, workflow list endpoints return metadata summaries, and run creation copies the current server Yjs snapshot into immutable run snapshot tables.
- Optimized workflow-canvas media node task queries, Yjs node-frame commits, and Yjs projection comparison so off-screen media nodes and drag-frame updates do less work on the hot path.
- Replaced workflow-canvas registry helper barrel imports with direct source imports while keeping registry initialization as explicit side effects.
- Reworked workflow canvas collaboration so Yjs is the only graph source of truth. Autosave/manual save now posts `{ name? }` to the collaboration checkpoint, clients no longer send `stateUpdate` or reconcile checkpoint snapshots back into ydoc, and `workflows.nodes/edges` is maintained as a server read model for runs and non-collaboration reads.
- Changed workflow canvas graph/media/task store actions to delegate to Yjs commands and removed the draft revision/document transaction queue from graph persistence.
- Changed workflow run creation to checkpoint the authoritative server ydoc before creating the run snapshot.
- Reworked workflow canvas primary collaboration persistence so Yjs is the durable graph source: local graph commands write into the live Yjs document immediately, autosave/manual save call a server-side collaboration checkpoint, and the frontend no longer uploads full nodes/edges through REST `PUT` in primary mode.
- Changed workflow canvas MediaView output selection to commit a Yjs graph command instead of using a version-sensitive REST media-view patch in the primary collaboration path.
- Reworked workflow canvas React Flow integration so high-frequency node/edge changes update a dedicated render store, while document commits and autosave happen only on semantic graph transactions.
- Remote Yjs updates now project snapshots one-way into the document/render path.
- Removed non-primary workflow canvas sync modes and the `VITE_WORKFLOW_CANVAS_SYNC_MODE` configuration.
- Moved workflow canvas node display data out of broad store subscriptions and runtime objects; node components now consume stable flow-node data plus narrow runtime/action stores.
- Changed video canvas nodes to render poster-only previews in the canvas and avoid mounting playable `<video>` elements in normal node bodies.
- Reworked workflow canvas image/video nodes as MediaView previews: image nodes render selected images directly, while video nodes render a poster and mount video playback only after user interaction.
- Reworked the workflow canvas composer into a selected-node floating card below image/video MediaView nodes, anchored through React Flow `NodeToolbar` so positioning follows React Flow internals while preserving a white glass UI aligned to `apps/web/DESIGN.md`.
- Split workflow canvas graph projection state from UI state: node selection/config panel state now lives in a dedicated UI store, while graph nodes/edges are projected from Yjs.
- Refined workflow media input UX with direct thumbnail drag ordering, in-thumbnail replace/delete actions, dashed upload wells, and a more compact floating composer layout.
- Added debounced workflow canvas auto-save so uploaded media slots, drag ordering, and node edits persist without requiring a manual save before refresh.
- Unified image-generation node media input semantics: image nodes now expose one ordered image media slot, treat any image input as image-to-image, and reject image-task `referenceImages` instead of migrating or merging them.
- Changed development provider image outputs to finalize as valid previewable PNG objects instead of placeholder text bytes.
- Removed the floating spark action from the Canvas page.
- Upgraded Drizzle packages to the v1 RC line and scoped Drizzle Kit push/introspection to Mina-owned public tables.
- Updated the web navigation to use TanStack Router links with route-aware active state.
- Switched API business runtime to PostgreSQL-only repositories and removed production in-memory persistence/storage adapters; tests now use explicit fakes.
- Removed the obsolete demo posts business module, `/api/posts` routes, shared post contracts, web post feature, seed data, and `posts` Drizzle table.
- Moved the web app skeleton into the TanStack root layout and locked the shell to a browser-sized non-scrolling viewport.
- Task resource snapshots now record `mediaObjectId`, slot coordinates, order, and structured lineage source.
- Flow-group scheduling now derives executable dependencies from node-output media slot sources.
- Workflow reconciliation now claims due running runs before processing and updates individual `workflow_run_node_states` rows instead of rewriting run-level JSON state.

### Fixed
- Removed workflow-canvas CSS effects that were costly on active canvases, including blur filters, SVG drop-shadow filters, keyframe edge/handle animations, and transition-driven transform scaling.
- Fixed multi-client workflow canvas reverts, remote overwrite, and transient empty-canvas states caused by dual state sources, checkpoint snapshot re-import, and broadcast echo paths.
- Fixed pre-sync empty Yjs projection wiping a hydrated canvas by guarding empty Yjs snapshots until provider sync, with a store-level empty snapshot sanity check.
- Fixed false saved state while disconnected by delaying autosave until Yjs is synced/connected and acknowledging checkpoint success only when the local state vector matches the server response.
- Fixed newly added image nodes disappearing after primary collaboration save by removing client full-state checkpoint uploads and keeping the server room ydoc authoritative.
- Fixed workflow canvas collaborative handoff where page A's recent position could reappear after page B moved the same node by removing save-response ydoc re-import and stale checkpoint snapshot overwrite paths.
- Fixed primary collaboration save conflicts and data-loss risk by replacing the previous stale-version retry behavior with server-side Yjs checkpoint persistence.
- Fixed workflow canvas collaboration regressions where stale node config updates could overwrite newer node positions, coarse snapshot replacements could remove unrelated collaborative graph state, and dirty local edits could be overwritten by remote snapshots.
- Fixed workflow canvas save/reload consistency in primary collaboration mode by checkpointing the server room ydoc, serializing read-model refresh, and keeping idle collaboration rooms briefly available for immediate diagnostic snapshots.
- Fixed workflow canvas Zustand subscriptions that returned fresh projection objects on every render, preventing React's `getSnapshot` infinite update warning and maximum-depth crash.
- Enabled Vite websocket proxy upgrades for `/api` workflow event streams and kept the canvas event socket stable across local dirty/version/selection changes.
- Reduced workflow canvas pan/zoom jank by moving the node config composer out of React Flow's transform-following toolbar layer and removing costly blur/filter effects from active canvas elements.
- Fixed controlled React Flow node dragging by syncing in-flight position changes into the canvas node state without marking the draft dirty until drag stop.

### Removed
- Removed frontend workflow autosave/manual-save checkpoint behavior and the editable `workflow_nodes` / `workflow_edges` read-model from active schema and services.
- Removed the unused workflow-canvas `graph-actions` re-export helper.
- Removed workflow canvas shadow/full-save rollback paths from production code, including document transaction replay state, Yjs transaction helpers, save-response ydoc re-import, remote update banner wiring, REST media-view patch persistence, and the web collaboration snapshot client.
- Removed the public full-graph `PUT /api/workflows/:id` workflow update path so collaborative graph writes only enter through Yjs sync and server checkpoint read-model refresh.
