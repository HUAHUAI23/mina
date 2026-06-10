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
| `MINA_AI_API_KEY` | Bearer key for the workflow chat OpenAI-compatible endpoint | empty |
| `MINA_AI_BASE_URL` | Workflow chat OpenAI-compatible API base URL | empty |
| `MINA_AI_MODEL` | Workflow chat model id accepted by `MINA_AI_BASE_URL` | empty |
| `MINA_AI_PROVIDER_NAME` | Provider label used by AI SDK metadata | `mina-ai` |
| `MINA_AI_TIMEOUT_MS` | Workflow chat model call timeout in milliseconds | `120000` |
| `GOOGLE_API_BASE_URL` | Google Gemini/Veo API base URL | `https://generativelanguage.googleapis.com` |
| `GOOGLE_API_KEY` | Google API key for Gemini image and Veo video providers | empty |
| `MINA_SCHEDULER_CRON` | Croner expression for task/workflow/chat recovery scheduler ticks | `*/5 * * * * *` |
| `MINA_SCHEDULER_ENABLED` | Enables the background task/workflow/chat scheduler outside tests | `false` |
| `MINA_PROVIDER_MEDIA_URL_EXPIRES_SECONDS` | Signed input media URL lifetime for third-party provider calls | `14400` |
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

Task, workflow, and assistant-run recovery require the background scheduler:

```bash
MINA_SCHEDULER_ENABLED=true bun run dev:api
```

Without the scheduler, `POST /api/tasks` and `POST /api/workflows/:id/runs` still create durable records, but tasks remain `queued` until a scheduler or worker tick starts them. Chat user messages still persist and newly created assistant runs are scheduled immediately by the request path. Retryable assistant failures are written back to `queued` with `next_retry_at` and are also scheduled by an in-process timer, but queued runs left by a process restart, future retries that become due while the process is down, and stale running runs are only recovered by the scheduler.

## UI System

The shared UI package lives in `packages/ui` and is consumed by `apps/web`.

The web app uses TanStack Router file-based routes under `apps/web/src/routes`. The generated route tree lives at `apps/web/src/routeTree.gen.ts`.

Generate the route tree manually when adding or renaming route files:

```bash
bun --filter @mina/web routes:generate
```

The web `dev`, `typecheck`, and `build` scripts run route generation automatically.

## Internationalization

Mina uses `@mina/i18n` with Paraglide JS for shared API and web messages. The supported locales are:

- `en`
- `zh-Hans`

Compile the generated Paraglide runtime manually when working directly on the catalogs:

```bash
bun run i18n:compile
```

The `@mina/i18n` package `typecheck` and `build` scripts compile messages automatically. The API and web `dev`, `typecheck`, `build`, and API `test` scripts also run the compile step first so generated `packages/i18n/src/paraglide` files do not need to be committed.

The web app stores the selected browser locale in `localStorage` under `mina.locale`, updates `<html lang>`, and sends it to the API through `X-Mina-Locale`. API locale resolution uses this order:

```text
X-Mina-Locale
-> mina_locale cookie
-> Accept-Language
-> en
```

Use `X-Mina-Locale` for deterministic API responses:

```bash
curl -H 'X-Mina-Locale: zh-Hans' http://localhost:3001/api/health
```

Localized API error responses keep `error.code` stable and expose `error.message` as display text. Optional fields include `error.locale`, primitive `error.params`, and validation `error.issues`. Client logic should branch on `error.code`, not `error.message`.

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

The API test suite uses explicit fakes under `apps/api/src/test` for unit and route coverage. Test doubles live in `doubles/<bounded-context>`, plain object builders live in `builders`, and multi-service fixtures live in `scenarios`. Application runtime dependencies still require PostgreSQL-backed repositories; the test script only overrides `MINA_STORAGE_DRIVER=s3` so stale local `.env` values cannot select a removed storage adapter.

### Production Build

```bash
bun run build
```

## Container Image

The repository includes a production `Dockerfile` and a GitHub Actions workflow that publishes images to GitHub Container Registry.

The image builds both workspaces with Bun, serves the Vite web build, and routes `/api`, `/docs`, `/openapi.json`, and API WebSocket endpoints to the Hono API from one exposed port.

### CI Publishing

The workflow lives at `.github/workflows/publish-image.yml`.

- Pull requests build the image without pushing it.
- Pushes to `main` publish `ghcr.io/<owner>/<repo>:main`, `:latest`, and `:sha-<commit>`.
- Version tags such as `v1.2.3` additionally publish semver tags such as `:1.2.3` and `:1.2`.
- Manual runs can override the image name with the `image_name` input.

The workflow uses the repository `GITHUB_TOKEN` with `packages: write` permission, so no extra registry secret is required for the default GHCR target.

### Local Image Build

```bash
docker build -t mina:local .
```

### Run The Image

```bash
docker run --rm -p 3000:3000 \
  -e MINA_DATABASE_URL=postgres://postgres:postgres@host.docker.internal:5432/mina \
  -e MINA_ALLOWED_ORIGIN=http://localhost:3000 \
  -e MINA_S3_BUCKET=your-bucket \
  -e MINA_S3_REGION=us-east-1 \
  ghcr.io/huahuai23/mina:latest
```

The container listens on `PORT`, defaulting to `3000`. `MINA_API_PORT` is set from `PORT` by the container start script when it is not provided.

Use the same runtime variables documented above for database, AI providers, task scheduler, and S3-compatible storage. Enable background task, workflow, and chat recovery in the container with `MINA_SCHEDULER_ENABLED=true`.

The default production shape is same-origin: serve the web app and API from one origin, leave `VITE_API_BASE_URL=/`, and set `MINA_ALLOWED_ORIGIN` to that origin. The browser session cookie is scoped for this same-site shape and is only used by media content reads, browser WebSocket upgrades, and logout of the current browser session; ordinary JSON APIs still use bearer authorization. Cookie-authenticated WebSocket upgrades reject non-matching `Origin` headers against `MINA_ALLOWED_ORIGIN`. If a future deployment splits the web and API across sites, the cookie `SameSite=None; Secure` policy and CSRF/origin checks must be designed together before enabling cookie-authenticated browser media and WebSocket traffic across origins.

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

Schema changes for the asset library tables live in `apps/api/src/db/schema.ts`. Use `db:push` during active local development after pulling these changes, or generate/apply migrations once the schema is ready for a migration-backed environment.

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
2. In production, prefer the same-origin container path with `VITE_API_BASE_URL=/`. Split-origin deployments need an explicit cookie and CSRF/origin policy before they can rely on browser session cookies for media or WebSocket requests.
3. `POST /api/auth/register` and `POST /api/auth/login` use the PostgreSQL-backed accounts repository. OAuth tables are present in the Drizzle schema, but OAuth runtime flows are not implemented yet.
4. The task/workflow core uses Drizzle repositories for tasks, media objects, pricing rules, workflow definitions, workflow runs, node states, node task links, and lifecycle events.
5. The asset library stores catalog, folder, tag, and source-snapshot rows over existing `media_objects`; deleting an asset library item does not delete the underlying media object.
6. Set `MINA_SCHEDULER_ENABLED=true` to run the Croner-backed task starter, async task poller, and workflow reconciler in the API process. A future standalone worker can run the same service loop.
7. `POST /api/tasks` creates a standalone `queued` task and returns immediately. Use `GET /api/tasks/:id` for status and `GET /api/tasks/:id/resources` for persisted input/output resources.
8. Workflow runs create and link node tasks, then rely on the scheduler/worker path to start providers and reconcile nodes from task status. Workflow creation does not block on provider execution.
9. Async providers return `pending`, `succeeded`, `failed`, or `cancelled` when polled. Pending tasks remain `running` and are retried after `MINA_TASK_POLL_DEFAULT_INTERVAL_SECONDS` or the provider-specific delay.
10. Task lifecycle events are recorded in `task_events`; workflow run and node lifecycle events are recorded in `workflow_run_events`.
11. Object storage keys are account-scoped under `users/{accountId}/...`; use `MINA_STORAGE_DRIVER=s3` plus the S3 variables for S3-compatible providers.
