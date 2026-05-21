# API

## Current Public Surface
The API currently exposes health, auth, tasks, workflow routes, and authenticated media-object upload/read routes. Asset-library UI APIs and user public-share request APIs are intentionally not exposed in this implementation phase.

## Auth APIs
- `POST /api/auth/register`: creates a username/password user, password credential, and first-party session.
- `POST /api/auth/login`: authenticates by username or email plus password and returns the user/session payload.
- The web app consumes both endpoints through the `@mina/api/client` Hono RPC type surface and validates response payloads with `AuthResponseSchema`.
- OAuth runtime endpoints are deferred; the schema is present for later provider login, client, consent, authorization code, and refresh-token work.

## Task APIs
- `POST /api/tasks`: create a durable queued task.
- `GET /api/tasks`: list tasks.
- `GET /api/tasks/:id`: get task detail.
- `GET /api/tasks/:id/resources`: inspect input/output resource snapshots, including media object and lineage fields.
- `POST /api/tasks/:id/cancel`: cancel queued or running tasks.

## Media APIs
- `POST /api/media-objects`: authenticated multipart upload for managed media objects.
- `POST /api/media-objects/presigned-upload`: authenticated presigned upload creation for managed media objects.
- `POST /api/media-objects/:id/complete-upload`: authenticated presigned upload completion.
- `GET /api/media-objects/:id`: authenticated account-scoped media object lookup.
- `GET /api/media-objects/:id/content`: authenticated account-scoped read redirect.
- Uploads with `purpose: "public_library"` are admin-only and return `403 ADMIN_REQUIRED` for ordinary users.

## Workflow APIs
- Workflow CRUD persists React Flow-compatible nodes and edges.
- `POST /api/workflows/:id/runs` creates an isolated-node or flow-group run.
- Node media inputs are resolved from persisted node `mediaSlots` and MediaView state during run reconciliation.

## Deferred APIs
- User upload form API.
- Asset library API.
- Canvas form/media slot editing API.
