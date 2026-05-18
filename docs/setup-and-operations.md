# Setup and Operations

## Requirements

- Bun `1.3.11` or newer within the `1.3.x` line
- A terminal environment that can run Bun workspaces

## Installation

```bash
bun install
```

## Environment

Create a local environment file from the example values:

```bash
cp .env.example .env.local
```

Environment variables are validated with `@t3-oss/env-core` and Zod during startup or tooling execution. Invalid enum, boolean, URL, or numeric values fail fast instead of silently falling back.

### Variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `MINA_API_PORT` | Bun API port | `3001` |
| `MINA_ALLOWED_ORIGIN` | CORS origin for the API | `http://localhost:3000` |
| `MINA_LOG_LEVEL` | Pino log level | `info` |
| `MINA_DATABASE_URL` | PostgreSQL URL used by the API runtime and database tooling | `postgres://postgres:postgres@localhost:5432/mina` |
| `MINA_POSTGRES_TEST_DATABASE_URL` | Optional PostgreSQL URL for opt-in Drizzle repository integration tests | empty |
| `GOOGLE_API_BASE_URL` | Google Gemini/Veo API base URL | `https://generativelanguage.googleapis.com` |
| `GOOGLE_API_KEY` | Google API key for Gemini image and Veo video providers | empty |
| `MINA_SCHEDULER_CRON` | Croner expression for task/workflow scheduler ticks | `*/5 * * * * *` |
| `MINA_SCHEDULER_ENABLED` | Enables the background task/workflow scheduler outside tests | `false` |
| `MINA_STORAGE_DRIVER` | Object storage driver. Runtime accepts `s3`. | `s3` |
| `MINA_STORAGE_ROOT_PREFIX` | Root prefix for per-account object storage keys | `users` |
| `MINA_TASK_MAX_RUNNING_SECONDS` | Maximum wall-clock time for a running provider task before it fails | `21600` |
| `MINA_TASK_POLL_BATCH_SIZE` | Maximum async provider tasks claimed per scheduler tick | `25` |
| `MINA_TASK_POLL_DEFAULT_INTERVAL_SECONDS` | Default delay before polling a pending provider task again | `10` |
| `MINA_TASK_POLL_LEASE_SECONDS` | Poll claim lease duration for concurrent schedulers | `30` |
| `MINA_TASK_POLL_MAX_INTERVAL_SECONDS` | Maximum provider polling delay or retry backoff | `120` |
| `MINA_TASK_PROVIDER_ERROR_MAX_RETRIES` | Maximum transport-level provider polling retries before task failure | `8` |
| `VOLCENGINE_ARK_API_KEY` | Default Volcengine Ark API key for Seedream/Seedance providers | empty |
| `VOLCENGINE_ARK_BASE_URL` | Volcengine Ark API base URL | `https://ark.cn-beijing.volces.com/api/v3` |
| `VOLCENGINE_ARK_MODEL_API_KEYS` | JSON object of model-specific Volcengine API keys | empty |
| `VOLCENGINE_IMAGE_MODEL_ALIASES` | JSON object mapping Mina image model ids to Volcengine upstream model ids | empty |
| `VOLCENGINE_VIDEO_MODEL_ALIASES` | JSON object mapping Mina video model ids to Volcengine upstream model ids | empty |
| `MINA_S3_REGION` | S3 client region when `MINA_STORAGE_DRIVER=s3` | `us-east-1` |
| `MINA_S3_BUCKET` | S3 bucket when `MINA_STORAGE_DRIVER=s3` | empty |
| `MINA_S3_ENDPOINT` | Optional S3-compatible endpoint | empty |
| `MINA_S3_ACCESS_KEY_ID` | Optional explicit S3 access key | empty |
| `MINA_S3_SECRET_ACCESS_KEY` | Optional explicit S3 secret key | empty |
| `MINA_S3_FORCE_PATH_STYLE` | Enables path-style S3 URLs for compatible providers | `false` |
| `MINA_S3_PUBLIC_BASE_URL` | Optional public base URL for stored object URLs | empty |
| `VITE_API_BASE_URL` | Browser-visible API base URL | `/` |

## Development

Run both the API and the web app:

```bash
bun run dev
```

### Endpoints

- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- Health: `http://localhost:3001/api/health`
- API reference: `http://localhost:3001/docs`
- OpenAPI JSON: `http://localhost:3001/openapi.json`

Task and workflow execution require the background scheduler:

```bash
MINA_SCHEDULER_ENABLED=true bun run dev:api
```

Without the scheduler, `POST /api/tasks` and `POST /api/workflows/:id/runs` still create durable records, but tasks remain `queued` until a scheduler or worker tick starts them.

## UI System

The shared UI package lives in `packages/ui` and is consumed by `apps/web`.

The web app uses TanStack Router file-based routes under `apps/web/src/routes`. The generated route tree lives at `apps/web/src/routeTree.gen.ts`.

Generate the route tree manually when adding or renaming route files:

```bash
bun --filter @mina/web routes:generate
```

The web `dev`, `typecheck`, and `build` scripts run route generation automatically.

Add all currently available shadcn/ui primitives from the web workspace config:

```bash
bunx --bun shadcn@latest add --all -c apps/web
```

Add a single shadcn/ui primitive the same way:

```bash
bunx --bun shadcn@latest add button -c apps/web
```

The command resolves `ui` and `hooks` aliases into `packages/ui`, while `apps/web` imports global design-system styles through `@mina/ui/globals.css`.

## Quality Commands

### Type Checking

```bash
bun run typecheck
```

### Tests

```bash
bun run test
```

The API test suite uses explicit fakes under `apps/api/src/test` for unit and route coverage. Application runtime dependencies still require PostgreSQL-backed repositories; the test script only overrides `MINA_STORAGE_DRIVER=s3` so stale local `.env` values cannot select a removed storage adapter.

### Production Build

```bash
bun run build
```

### Full Verification

```bash
bun run check
```

### Import Boundary Check

```bash
bun run check:boundaries
```

This verifies backend contract imports, API/domain layering, and web-to-API package boundaries.

### API Documentation Smoke Check

Verify the API docs endpoints without starting a separate server:

```bash
bun -e "import { createApp } from './apps/api/src/app/create-app.ts'; const app = createApp(); console.log((await app.request('/openapi.json')).status); console.log((await app.request('/docs')).status)"
```

## Database

The API runtime uses PostgreSQL-backed Drizzle repositories for business persistence.

Database command entrypoints live under `apps/api/scripts/db`; reusable schema and connection helpers stay under `apps/api/src/db`.

During active development, sync the current Drizzle schema directly to the configured database without writing migration files:

```bash
bun --filter @mina/api db:push
```

Reset Mina-owned development tables and then sync the current schema:

```bash
bun --filter @mina/api db:reset:push
```

Create or drop the configured development database itself:

```bash
bun --filter @mina/api db:create
bun --filter @mina/api db:drop
```

Generate Drizzle migrations after the schema is finalized:

```bash
bun --filter @mina/api db:generate
```

Apply migrations to the configured database:

```bash
bun --filter @mina/api db:migrate
```

To test the full migration workflow from an empty database, drop the configured database, recreate it, generate migrations, and apply them:

```bash
bun --filter @mina/api db:migration:test
```

Seed default development user, password credential, account, and pricing rules:

```bash
bun --filter @mina/api db:seed
```

Run PostgreSQL-backed repository concurrency tests against a disposable database:

```bash
MINA_POSTGRES_TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/mina_test bun --filter @mina/api test ./src/modules/workflows/repositories/drizzle-workflow-repositories.integration.test.ts
```

The test creates and drops an isolated schema inside the configured database.

## Operational Notes

1. The web app proxies `/api/*` to the local Bun API during development.
2. In production, set `VITE_API_BASE_URL` to the deployed API origin if the frontend and backend are split.
3. `POST /api/auth/register` and `POST /api/auth/login` use the PostgreSQL-backed accounts repository. OAuth tables are present in the Drizzle schema, but OAuth runtime flows are not implemented yet.
4. The task/workflow core uses Drizzle repositories for tasks, media objects, pricing rules, workflow definitions, workflow runs, node states, node task links, and lifecycle events.
5. Set `MINA_SCHEDULER_ENABLED=true` to run the Croner-backed task starter, async task poller, and workflow reconciler in the API process. A future standalone worker can run the same service loop.
6. `POST /api/tasks` creates a standalone `queued` task and returns immediately. Use `GET /api/tasks/:id` for status and `GET /api/tasks/:id/resources` for persisted input/output resources.
7. Workflow runs create and link node tasks, then rely on the scheduler/worker path to start providers and reconcile nodes from task status. Workflow creation does not block on provider execution.
8. Async providers return `pending`, `succeeded`, `failed`, or `cancelled` when polled. Pending tasks remain `running` and are retried after `MINA_TASK_POLL_DEFAULT_INTERVAL_SECONDS` or the provider-specific delay.
9. Task lifecycle events are recorded in `task_events`; workflow run and node lifecycle events are recorded in `workflow_run_events`.
10. Object storage keys are account-scoped under `users/{accountId}/...`; use `MINA_STORAGE_DRIVER=s3` plus the S3 variables for S3-compatible providers.
