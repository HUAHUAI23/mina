# API

## Current Public Surface
The API currently exposes health, auth, tasks, and workflow routes. Media object upload and asset-library UI APIs are intentionally not exposed in this implementation phase.

## Task APIs
- `POST /api/tasks`: create a durable queued task.
- `GET /api/tasks`: list tasks.
- `GET /api/tasks/:id`: get task detail.
- `GET /api/tasks/:id/resources`: inspect input/output resource snapshots, including media object and lineage fields.
- `POST /api/tasks/:id/cancel`: cancel queued or running tasks.

## Workflow APIs
- Workflow CRUD persists React Flow-compatible nodes and edges.
- `POST /api/workflows/:id/runs` creates an isolated-node or flow-group run.
- Node media inputs are resolved from persisted node `mediaSlots` and MediaView state during run reconciliation.

## Deferred APIs
- User upload form API.
- Asset library API.
- Canvas form/media slot editing API.
