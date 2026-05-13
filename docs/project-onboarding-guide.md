# Project Onboarding Guide

## Start Here

Mina is a Bun/Turbo monorepo with deployable apps under `apps/*` and shared packages under `packages/*`.

Primary references:

- `docs/architecture.md`: package boundaries, backend layering, and workflow semantics.
- `docs/development-standards.md`: repository, TypeScript, API, frontend, testing, and documentation rules.
- `docs/setup-and-operations.md`: install, environment, development, and verification commands.

## Current Stack

- Runtime and package manager: Bun
- Monorepo orchestration: Turborepo
- API: Bun + Hono
- Web: Vite + React
- Shared contracts: Zod schemas and inferred TypeScript types in `@mina/contracts`
- Database target: PostgreSQL with Drizzle schema in `apps/api/src/db/schema.ts`
- Scheduler: Croner-backed background task/workflow loop
- Runtime logging: Pino
- Object storage: S3-compatible adapter using AWS SDK for JavaScript v3

## Backend Entry Points

API composition starts in:

- `apps/api/src/app/create-app.ts`
- `apps/api/src/app/dependencies.ts`
- `apps/api/src/index.ts`

Feature modules live under `apps/api/src/modules/<feature>/` and follow:

```text
routes -> service -> repository -> data source or adapter
```

## Task And Workflow Core

Shared contracts:

- `packages/contracts/src/modules/tasks/task.schemas.ts`
- `packages/contracts/src/modules/pricing/pricing.schemas.ts`
- `packages/contracts/src/modules/canvas/canvas.schemas.ts`
- `packages/contracts/src/modules/workflows/workflow.schemas.ts`

API modules:

- `apps/api/src/modules/tasks/`
- `apps/api/src/modules/pricing/`
- `apps/api/src/modules/workflows/`
- `apps/api/src/lib/storage/`

Tasks are a standalone execution primitive. `POST /api/tasks` creates a durable queued task and returns before provider execution. The scheduler/worker path starts queued tasks, polls async provider work, and writes terminal task status and resources.

Task providers are registered by provider key and expose explicit start/poll/cancel semantics. Async provider polling can return pending without failing the task; terminal succeeded/failed/cancelled results drive the durable task status.

Workflow internals:

- `workflows.service.ts`: workflow CRUD, version checks, run creation, and isolated-node preflight.
- `execution.ts`: run reconciliation, node task creation, flow-group DAG execution, and state transitions. It does not call providers directly; workflow nodes observe task status through reconciliation.
- `graph.ts`: graph traversal and executable/group predicates.
- `media.ts`: media-slot role/kind mapping, MediaView selection, and task config assembly.
- `validation.ts`: persisted canvas and flow-group validation.
- `workflow-events.ts`: durable workflow run and node lifecycle event logging.

Task lifecycle logging lives in `apps/api/src/modules/tasks/task-events.ts`.

User/account ownership is represented in PostgreSQL by `users` and `accounts`; task and workflow product records reference `accounts.id`. Object storage keys are account-scoped under `users/{accountId}/...`.

## Canvas Semantics

Media edges always represent target media slots.

- Ordinary canvas execution runs only the selected node. Required upstream media is resolved from the source node's persisted `mediaView`.
- Flow-group execution treats edges as media slots and execution dependencies. Roots run first, then downstream nodes resolve upstream outputs by resource kind, role, and index.
- Node groups are visual only.
- Workflow runs remain running until the scheduler/worker completes their linked node tasks and reconciliation marks nodes terminal.

Persist React Flow-compatible stable fields only: `id`, `type`, `position`, `parentId`, `extent`, dimensions, and typed `data`. Do not persist transient UI fields like `selected`, `dragging`, or `measured`.

## Verification

Use the full check before handing off structural changes:

```bash
bun run check
```

For focused backend iteration:

```bash
bun run typecheck:api
bun --filter @mina/api test
```
