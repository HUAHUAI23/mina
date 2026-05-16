# Architecture

## Goals

This repository is structured for:

1. Clear application vs library boundaries
2. Stable package ownership
3. Shared runtime contracts between the API and the web app
4. Type-safe development with strict TypeScript defaults
5. Gradual backend evolution from in-memory repositories to real database adapters

## Top-Level Structure

```text
.
├── apps
│   ├── api
│   │   └── src
│   │       ├── app
│   │       ├── config
│   │       ├── lib
│   │       └── modules
│   └── web
│       └── src
│           ├── app
│           ├── config
│           ├── features
│           └── lib
├── docs
└── packages
    ├── contracts
    ├── ui
    └── typescript-config
```

## Package Responsibilities

### `apps/api`

The Bun + Hono API application.

- `src/app/`: application composition and route graph
- `src/config/`: environment parsing
- `src/lib/`: shared HTTP primitives
- `src/modules/<feature>/`: route handlers, business services, repositories, and data sources

### `apps/web`

The Vite + React application.

- `src/app/`: providers, app shell, and shared app-level styling
- `src/config/`: client-safe environment parsing
- `src/features/<feature>/`: feature-specific API calls, hooks, and components
- `src/lib/`: reusable client-side utilities

### `packages/contracts`

Shared runtime schemas and inferred TypeScript types for the full stack.

- Request validation schemas
- Response validation schemas
- Shared DTOs and route data structures
- User/account, task, pricing, workflow, and React Flow-compatible canvas contracts

### `packages/ui`

Shared React UI primitives and design-system styling for browser applications.

- shadcn/ui components generated into `src/components`
- shared client-side UI hooks in `src/hooks`
- UI utilities such as `cn` in `src/lib`
- Tailwind CSS v4 theme tokens and source registration in `src/styles/globals.css`

### `packages/typescript-config`

Shared TypeScript baselines for the workspace.

- `base.json`: universal strict settings
- `bun.json`: Bun-oriented settings
- `react-app.json`: browser and React settings

## Backend Layering

The API follows this sequence:

```text
route -> service -> repository -> data source
```

### Route Layer

Owns HTTP-only concerns:

- Hono routing
- request validation
- status codes
- request/response conversion

### Service Layer

Owns business behavior:

- domain rules
- orchestration
- error semantics
- repository coordination

### Repository Layer

Owns persistence behavior:

- record lookup
- inserts
- deletes
- future database integration

### Data Layer

Owns static seed data or adapter bootstrapping.

## Task And Workflow Core

Mina now has backend contracts and API services for the generation workflow core:

- `media`: managed media object persistence for user uploads, workflow slot inputs, mirrored provider outputs, derived previews, storage usage, and object storage key ownership.
- `tasks`: durable image/video generation task lifecycle, including standalone task submission, sync image tasks, async video tasks, input/output resource snapshots, output media finalization, idempotent client submission, and task cancellation.
- `pricing`: model and pricing-key aware estimates for token, image-count, and duration billing.
- `workflows`: React Flow-compatible workflow definitions, ordered node `mediaSlots`, ordinary canvas node execution, flow-group DAG execution, node run states, and run cancellation.

The workflow module keeps public services small and splits stable internal rules by responsibility:

- `workflows.service.ts`: workflow definition CRUD, version checks, MediaView updates, and node task link lookup.
- `workflow-runs.service.ts`: workflow run creation, run lookup/listing, cancellation, isolated-node preflight, and reconciliation entrypoints.
- `run-executor.ts`: workflow-run reconciliation and flow-group DAG scheduling.
- `node-executor.ts`: single-node task creation, task observation, node state transitions, and node event recording.
- `run-state.ts`: initial node state creation and pure run/node state builders.
- `graph.ts`: canvas graph traversal and executable/group node predicates.
- `media-selection.ts`: compatibility exports for media-slot role/kind mapping and output selection.
- `media/*`: `WorkflowMediaResolver`, media slot helpers, and media input builders for `media_object`, `external_url`, current MediaView, and current workflow-run output sources.
- `task-config.ts`: media envelope assembly for task config preparation.
- `validation.ts`: persisted canvas validation, media slot/edge consistency checks, and flow-group scope/cycle validation.
- `group-conversion.ts`: pure helper for converting `flow_group` nodes to visual-only `node_group` nodes and downgrading `run_output` media slot sources to `current_media`.

The default local runtime uses in-memory repositories so tests and development do not require PostgreSQL. Set `MINA_PERSISTENCE_DRIVER=postgres` to use the Drizzle-backed task, pricing, workflow, and media object repositories against the PostgreSQL schema in `apps/api/src/db/schema.ts`.

User ownership is represented by `users` and `accounts`. Product data that belongs to a tenant stores `account_id`; `tasks`, `task_resources`, `media_objects`, `workflows`, and `workflow_runs` reference `accounts.id`. Event and link tables remain subordinate to their parent task or workflow run records.

Background work is handled by a Croner-backed `BackgroundTaskScheduler` when `MINA_SCHEDULER_ENABLED=true`. Each tick starts due `queued` tasks, polls due async provider tasks, and then reconciles running workflow runs. The Drizzle task repository claims due queued/running tasks with `FOR UPDATE SKIP LOCKED` before provider calls so multiple schedulers do not process the same task at the same time.

Task providers are registered as model specs in `ModelRegistry`, then dispatched by `ProviderRouter`. A model spec owns parameter validation, defaults, task mode, pricing input, input resource collection, provider request mapping, and output mapping. Provider polling reports `pending`, `succeeded`, `failed`, or `cancelled`. Pending provider results keep the Mina task in `running` status and update `nextRetryAt`; only terminal provider results complete or fail the task. Transport-level polling errors use retry/backoff counters and are distinct from provider terminal failures.

The task module keeps lifecycle behavior behind small internal files:

- `tasks.service.ts`: public task use cases, task creation, listing, lookup, cancellation entrypoint, and worker entrypoints.
- `lifecycle.ts`: provider start/poll result handling, terminal state transitions, retry handling, output resource persistence, and lifecycle event recording.
- `models/model-registry.ts`: model lookup with duplicate protection.
- `models/model-spec.ts`: model-owned config, pricing, resource, and provider lifecycle contract.
- `models/provider-router.ts`: `TaskProvider` dispatch to the selected model spec.
- `config/task-config-assembler.ts`: workflow draft config plus media envelope preparation through model specs.
- `output/task-output-finalizer.ts`: mirrors provider outputs from data URLs, HTTP(S), memory URLs, `mina://media/{id}`, and dev `mina://tasks/...` outputs into managed media objects before task success is persisted.
- `output/output-post-processor.ts`: generic output invariants, including required `video_cover` resources for successful video tasks.
- `output/video-cover-generator.ts`: creates video cover resources through `MediaObjectService`, with deterministic fallback for non-HTTP test/dev video URLs.
- `pricing.ts`: actual-cost calculation from provider usage.
- `resources.ts`: task input/output resource mapping.
- `retry.ts`: retry/backoff and expiry helpers.
- `providers/provider.ts`: provider port types.
- `providers/dev/*`, `providers/google/*`, and `providers/volcengine/*`: model specs, mappers, and provider clients.

The task API is the canonical execution entrypoint. `POST /api/tasks` creates a durable `queued` task and returns it immediately; clients then poll `GET /api/tasks/:id` or inspect `GET /api/tasks/:id/resources`. Workflow execution uses the same task queue: workflow runs create and link node tasks, then the background scheduler starts tasks and later reconciles node/run state from task terminal status. This keeps direct task submission and canvas execution on one state machine.

Runtime logs use Pino through `src/lib/logger/logger.ts`. Durable lifecycle logs are stored separately in PostgreSQL:

- `task_events`: task creation, start, provider submission, polling, success, and cancellation.
- `workflow_run_events`: workflow run creation/cancellation/finalization and workflow node task/start/success/failure events.

### Canvas Execution Semantics

Executable node media inputs are owned by target node `data.mediaSlots`. Edges remain as React Flow visual links and as a consistency projection for node-output slot items.

- Slot items can point to `media_object`, `external_url`, `node_output/current_media`, or `node_output/run_output` sources.
- Within one slot, item order is determined by `mediaSlots[slot][].order`, with item id as a deterministic tie-breaker.
- On the ordinary canvas, running a selected node resolves required upstream media from the source node's persisted `mediaView`. Upstream nodes are not executed automatically.
- Inside a `flow_group`, execution dependencies are derived from node-output media slot sources. A flow run executes all roots in the group and downstream nodes resolve media from the current run's upstream outputs by resource kind, role, and index.
- `node_group` is visual only and does not affect execution.
- Workflow run creation does not call external providers directly. It creates pending node tasks and relies on the task scheduler/worker path to start providers, poll async work, and reconcile workflow nodes.

### Object Storage

Object storage is abstracted behind `ObjectStorage` in `apps/api/src/lib/storage`. The production implementation uses the AWS SDK for JavaScript v3 S3 client and works with S3-compatible providers through endpoint/path-style configuration.

Storage keys are account-scoped by construction:

```text
users/{accountId}/{scope}/{objectName}
```

The key builder rejects empty, reserved, traversal, and cross-account paths. This keeps user resources under one root so later quota, cleanup, and resource management jobs can operate per account without scanning unrelated objects.

Managed media objects use the `media` scope:

```text
users/{accountId}/media/{mediaObjectId}/original.{ext}
users/{accountId}/media/{mediaObjectId}/cover.jpg
```

The `media_objects` table is the file entity table. Workflow slots, task input resources, task output resources, and future asset library rows should reference `media_objects` instead of treating object storage URLs as the system of record. Account storage usage is calculated from ready, non-deleted `media_objects.byteSize` values.

`task_resources` remains the task-level resource index. It now stores `media_object_id`, `slot`, `slot_item_id`, `slot_order`, and structured `source` for input lineage and output traceability.

React Flow compatibility rules:

- Persist `parentId`, not the old `parentNode` field.
- Persist only stable node/edge fields, not transient UI fields such as `selected`, `dragging`, or `measured`.
- Keep parent nodes before child nodes in the persisted `nodes` array.

## Frontend Layering

The web app follows this sequence:

```text
feature component -> shared UI primitive -> hook -> feature api client -> shared http utility -> typed Hono client
```

This ensures that UI components do not depend on low-level transport details.

The web app imports shared design-system CSS from `@mina/ui/globals.css` and composes shadcn/ui primitives through package entrypoints such as `@mina/ui/components/button`.

## API Contract Boundary

The web app does not import server implementation files. It only imports:

1. Shared schemas and types from `@mina/contracts`
2. The typed route surface from `@mina/api/client`

This keeps the client aligned with the API surface without coupling it to Bun-specific runtime code.

## Environment Strategy

- Server variables use regular environment names such as `MINA_API_PORT`.
- Client-safe values use the `VITE_` prefix so they can be accessed through `import.meta.env`.
- Secrets must never use the `VITE_` prefix.
- Runtime environment values are validated through `@t3-oss/env-core` and Zod in app-local `src/config/env.ts` modules.
- Tooling that needs environment values, such as Drizzle Kit and Vite dev proxy configuration, must reuse the same validation approach instead of reading raw strings directly.

## Testing Strategy

The API uses Bun tests against `app.request(...)`, which allows route-level behavior to be verified without starting a separate server process.

## Planned Next Step for Database Work

The account, task, pricing, media object, and workflow modules have Drizzle-backed schema coverage. The remaining persistence work is:

1. Add a Drizzle-backed posts repository if posts become product data.
2. Add integration tests that run migrations against a disposable PostgreSQL database.
3. Move the existing scheduler loop from the API process to a separate worker process if API-process scheduling is not enough operationally.
