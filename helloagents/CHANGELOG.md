# Changelog

This file records important project changes.

## [Unreleased]

### Added
- Added managed media objects, media object persistence, storage usage aggregation, and account-scoped media storage keys.
- Added workflow `mediaSlots` contracts and backend resolution for media objects, external URLs, current MediaView outputs, and current workflow-run outputs.
- Added task output finalization so provider outputs are mirrored into Mina-managed media objects before task success is persisted.

### Changed
- Task resource snapshots now record `mediaObjectId`, slot coordinates, order, and structured lineage source.
- Flow-group scheduling now derives executable dependencies from node-output media slot sources.
