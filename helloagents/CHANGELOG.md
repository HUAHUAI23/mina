# Changelog

This file records important project changes.

## [Unreleased]

### Added
- Added managed media objects, media object persistence, storage usage aggregation, and account-scoped media storage keys.
- Added workflow `mediaSlots` contracts and backend resolution for media objects, external URLs, current MediaView outputs, and current workflow-run outputs.
- Added task output finalization so provider outputs are mirrored into Mina-managed media objects before task success is persisted.
- Added normalized workflow definition/run storage tables and scheduler lease fields for multi-replica workflow reconciliation.
- Added task idempotency keys for workflow-created node task retries.
- Added opt-in PostgreSQL-backed workflow repository concurrency tests for run claiming, leases, node state predicates, and duplicate node starts.

### Changed
- Task resource snapshots now record `mediaObjectId`, slot coordinates, order, and structured lineage source.
- Flow-group scheduling now derives executable dependencies from node-output media slot sources.
- Workflow reconciliation now claims due running runs before processing and updates individual `workflow_run_node_states` rows instead of rewriting run-level JSON state.
