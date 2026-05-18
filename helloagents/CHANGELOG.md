# Changelog

This file records important project changes.

## [Unreleased]

### Added
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
- Removed the floating spark action from the Canvas page.
- Upgraded Drizzle packages to the v1 RC line and scoped Drizzle Kit push/introspection to Mina-owned public tables.
- Updated the web navigation to use TanStack Router links with route-aware active state.
- Switched API business runtime to PostgreSQL-only repositories and removed production in-memory persistence/storage adapters; tests now use explicit fakes.
- Removed the obsolete demo posts business module, `/api/posts` routes, shared post contracts, web post feature, seed data, and `posts` Drizzle table.
- Moved the web app skeleton into the TanStack root layout and locked the shell to a browser-sized non-scrolling viewport.
- Task resource snapshots now record `mediaObjectId`, slot coordinates, order, and structured lineage source.
- Flow-group scheduling now derives executable dependencies from node-output media slot sources.
- Workflow reconciliation now claims due running runs before processing and updates individual `workflow_run_node_states` rows instead of rewriting run-level JSON state.
