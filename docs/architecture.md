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

- `tasks`: durable image/video generation task lifecycle, including standalone task submission, sync image tasks, async video tasks, input/output resources, idempotent client submission, and task cancellation.
- `pricing`: model and pricing-key aware estimates for token, image-count, and duration billing.
- `workflows`: React Flow-compatible workflow definitions, media-slot edges, ordinary canvas node execution, flow-group DAG execution, node run states, and run cancellation.

The workflow module keeps public services small and splits stable internal rules by responsibility:

- `workflows.service.ts`: workflow definition CRUD, version checks, MediaView updates, and node task link lookup.
- `workflow-runs.service.ts`: workflow run creation, run lookup/listing, cancellation, isolated-node preflight, and reconciliation entrypoints.
- `run-executor.ts`: workflow-run reconciliation and flow-group DAG scheduling.
- `node-executor.ts`: single-node task creation, task observation, node state transitions, and node event recording.
- `run-state.ts`: initial node state creation and pure run/node state builders.
- `graph.ts`: canvas graph traversal and executable/group node predicates.
- `media-selection.ts`: media-slot role/kind mapping, MediaView output selection, and media input conversion.
- `task-config.ts`: image/video task config assembly and input resource collection.
- `validation.ts`: persisted canvas validation and flow-group scope/cycle validation.

The default local runtime uses in-memory repositories so tests and development do not require PostgreSQL. Set `MINA_PERSISTENCE_DRIVER=postgres` to use the Drizzle-backed task, pricing, and workflow repositories against the PostgreSQL schema in `apps/api/src/db/schema.ts`.

User ownership is represented by `users` and `accounts`. Product data that belongs to a tenant stores `account_id`; `tasks`, `task_resources`, `workflows`, and `workflow_runs` now reference `accounts.id`. Event and link tables remain subordinate to their parent task or workflow run records.

Background work is handled by a Croner-backed `BackgroundTaskScheduler` when `MINA_SCHEDULER_ENABLED=true`. Each tick starts due `queued` tasks, polls due async provider tasks, and then reconciles running workflow runs. The Drizzle task repository claims due queued/running tasks with `FOR UPDATE SKIP LOCKED` before provider calls so multiple schedulers do not process the same task at the same time.

Task providers are registered behind `TaskProviderRegistry` by provider key. A provider starts a task and then reports polling results as `pending`, `succeeded`, `failed`, or `cancelled`. Pending provider results keep the Mina task in `running` status and update `nextRetryAt`; only terminal provider results complete or fail the task. Transport-level polling errors use retry/backoff counters and are distinct from provider terminal failures.

The task module keeps lifecycle behavior behind small internal files:

- `tasks.service.ts`: public task use cases, task creation, listing, lookup, cancellation entrypoint, and worker entrypoints.
- `lifecycle.ts`: provider start/poll result handling, terminal state transitions, retry handling, output resource persistence, and lifecycle event recording.
- `domain.ts`: task facts such as kind, mode, provider, and model extraction.
- `pricing.ts`: deterministic pricing request construction and actual-cost calculation.
- `resources.ts`: task input/output resource mapping.
- `retry.ts`: retry/backoff and expiry helpers.
- `providers/provider.ts`: provider port types.
- `providers/registry.ts`: provider registry dispatch.
- `providers/dev.provider.ts`: local development provider adapter.

The task API is the canonical execution entrypoint. `POST /api/tasks` creates a durable `queued` task and returns it immediately; clients then poll `GET /api/tasks/:id` or inspect `GET /api/tasks/:id/resources`. Workflow execution uses the same task queue: workflow runs create and link node tasks, then the background scheduler starts tasks and later reconciles node/run state from task terminal status. This keeps direct task submission and canvas execution on one state machine.

Runtime logs use Pino through `src/lib/logger/logger.ts`. Durable lifecycle logs are stored separately in PostgreSQL:

- `task_events`: task creation, start, provider submission, polling, success, and cancellation.
- `workflow_run_events`: workflow run creation/cancellation/finalization and workflow node task/start/success/failure events.

### Canvas Execution Semantics

Media edges always represent media-slot connections.

- On the ordinary canvas, running a selected node resolves required upstream media from the source node's persisted `mediaView`. Upstream nodes are not executed automatically.
- Inside a `flow_group`, edges are also execution dependencies. A flow run executes all roots in the group and downstream nodes resolve media from the current run's upstream outputs by resource kind, role, and index.
- `node_group` is visual only and does not affect execution.
- Workflow run creation does not call external providers directly. It creates pending node tasks and relies on the task scheduler/worker path to start providers, poll async work, and reconcile workflow nodes.

### Object Storage

Object storage is abstracted behind `ObjectStorage` in `apps/api/src/lib/storage`. The production implementation uses the AWS SDK for JavaScript v3 S3 client and works with S3-compatible providers through endpoint/path-style configuration.

Storage keys are account-scoped by construction:

```text
users/{accountId}/{scope}/{objectName}
```

The key builder rejects empty, reserved, traversal, and cross-account paths. This keeps user resources under one root so later quota, cleanup, and resource management jobs can operate per account without scanning unrelated objects.

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

The account, task, pricing, and workflow modules have Drizzle-backed schema coverage. The remaining persistence work is:

1. Add a Drizzle-backed posts repository if posts become product data.
2. Add integration tests that run migrations against a disposable PostgreSQL database.
3. Move the existing scheduler loop from the API process to a separate worker process if API-process scheduling is not enough operationally.
