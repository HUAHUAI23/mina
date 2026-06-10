# Mina Audit Report (2026-03)

## Summary

This repository started as a small demo but did not meet current Bun + Hono full-stack engineering expectations for a maintainable monorepo. The codebase has now been upgraded to a clearer `apps/* + packages/*` structure, stricter TypeScript defaults, shared dependency catalogs, typed contracts, and a layered Hono API.

## What Was Wrong Before

1. The root `package.json` did not declare `packageManager`, which caused `turbo dev` to fail immediately.
2. Applications and libraries were mixed under `packages/*` instead of being split into `apps/*` and `packages/*`.
3. The frontend imported `@mina/api/src/app` directly, which crossed package boundaries and coupled the UI to server internals.
4. The backend stored routing, state, and business logic in one file, making future database work harder.
5. Error handling, top-level `notFound` handling, environment handling, and testing were minimal.
6. The TypeScript setup was strict, but it was not strict enough for a modern engineering-first monorepo.
7. Generated build artifacts from previous runs were left next to source files.

## What Was Implemented

### Monorepo and Tooling

- Added `packageManager` and Bun workspace catalogs in the root `package.json`.
- Upgraded Turborepo to `2.8.21`.
- Moved the repository to `apps/*` for deployable applications and `packages/*` for shared libraries and tooling.
- Added `bunfig.toml` with isolated installs for more predictable workspace resolution.
- Added `typecheck`, `test`, and `check` workflows.

### TypeScript

- Added a shared `@mina/typescript-config` workspace package.
- Enabled stronger compiler rules such as `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noUnusedLocals`, `noUnusedParameters`, and `verbatimModuleSyntax`.
- Kept a root solution `tsconfig.json` for editor coordination across workspaces.

### API

- Refactored the API into:
  - `app/` for composition
  - `config/` for environment handling
  - `lib/http/` for shared HTTP error helpers
  - `modules/health/` for health endpoints
  - `modules/posts/` for route, service, repository, and data layers
- Added top-level `notFound` and `onError` handling.
- Added Bun tests using `app.request(...)`.
- Kept the repository in-memory but isolated it behind a `PostRepository` interface so it can be replaced with a real database adapter later.

### Frontend

- Reorganized the frontend into:
  - `app/` for composition and providers
  - `config/` for environment handling
  - `lib/` for shared HTTP utilities
  - `features/posts/` for API access, hooks, and components
- Removed direct imports from API internals and replaced them with a dedicated API client contract entrypoint.
- Added a stronger visual system with reusable CSS classes instead of inline styles.

## Version Baseline Chosen

The following versions were verified on 2026-03-29 using live npm metadata in the workspace:

| Package | Version |
| --- | --- |
| Bun runtime / package manager | `1.3.11` |
| turbo | `2.8.21` |
| hono | `4.12.9` |
| @hono/standard-validator | `0.2.2` |
| react | `19.2.4` |
| react-dom | `19.2.4` |
| vite | `8.0.3` |
| @vitejs/plugin-react | `6.0.1` |
| @tanstack/react-query | `5.95.2` |
| typescript | `6.0.2` |
| zod | `4.3.6` |

## Remaining Intentional Tradeoffs

1. The posts module still uses an in-memory repository because there is no existing database product requirement in the repository.
2. The repository and service layers are intentionally asynchronous so the module can move to Drizzle, Prisma, SQL, or another adapter without changing the route contract.
3. `@types/bun` is pinned to the active Bun `1.3.x` runtime line to reduce runtime/type drift.

## Result

The project now matches mainstream 2026 Bun + Hono monorepo practices far better than the original state:

- `bun run dev` starts correctly
- `bun run typecheck` passes
- `bun run test` passes
- `bun run build` passes

## 2026-05 Engineering Baseline Update

The follow-up audit tightened the current monorepo baseline:

- Added shared `@mina/ui` for shadcn/ui primitives, Tailwind CSS v4 theme tokens, and UI package entrypoints.
- Added `@t3-oss/env-core` with Zod validation for API, Web, Vite, and Drizzle environment handling.
- Moved direct dependency versions into the Bun workspace catalog where they are shared by workspace packages.
- Updated the Bun runtime baseline and Bun type package to the active `1.3.x` line used by the workspace.
- Kept instruction-only Markdown artifacts out of deployable app directories.
- Reworked task providers around explicit start/poll/cancel semantics so async providers can return pending results without failing tasks.
- Added an image-count billing metric for image generation pricing.
- Added standalone task submission with idempotency keys and moved provider execution to the scheduler/worker path so workflow runs and direct task requests share the same durable task state machine.

## 2026-05-13 Backend Refactor Baseline Update

The backend structure was refactored against `docs/design/backend-refactor-guidance.md`:

- Kept feature route factories inside `apps/api/src/modules/*` and retained `apps/api/src/app/api-router.ts` as the central Hono route graph.
- Added contracts module subpath exports and moved API imports away from the broad `@mina/contracts` root barrel.
- Split task provider, pricing, resource mapping, retry, domain, and lifecycle responsibilities out of `tasks.service.ts`.
- Split workflow run routes, workflow run service, run executor, node executor, run state, media selection, and task config responsibilities out of the previous workflow service/execution helpers.
- Added admin-first authorization policy helpers for public resource governance while keeping user public-share requests explicitly unimplemented.
- Added `bun run check:boundaries` as a lightweight import boundary check until full ESLint boundary tooling exists.
- Expanded API route-level tests to cover the typed client route surface in `apps/api/src/client.ts`.

Verification after the migration:

- `bun run check:boundaries` passes.
- `bun run check` passes, including workspace typecheck, tests, and builds.

## 2026-06 Chat And Test Fixture Baseline Update

The workflow canvas agent chat moved from UI-only planning into a durable backend and frontend runtime:

- Added shared chat contracts for threads, ordered message parts, chat events, and assistant deltas.
- Added PostgreSQL-backed chat persistence for `chat_threads`, `chat_messages`, `chat_message_parts`, `chat_message_attachments`, and `chat_assistant_runs`.
- Added per-thread `orderIndex` ordering so REST history, WebSocket cache updates, optimistic messages, and assistant context windows use one durable ordering model.
- Added AI SDK Core plus `@ai-sdk/openai-compatible` integration behind Mina's chat service. The service accepts configurable OpenAI-compatible endpoints and keeps provider failures behind semantic Mina error messages.
- Added durable assistant run recovery. Request-time creation schedules the thread immediately, and the background scheduler scans queued runs plus stale running runs so process restarts do not strand assistant placeholders.
- Added chat attachment support over `media_objects` with `purpose=chat_attachment`, file/image part validation, object-storage reads for AI inputs, and no presigned storage URLs in chat DTOs.
- Replaced the single large API `test/fakes.ts` file with bounded-context doubles under `apps/api/src/test/doubles`, plain object builders under `apps/api/src/test/builders`, and cross-module scenarios under `apps/api/src/test/scenarios`.

Verification after the update:

- `bun --filter @mina/api typecheck` passes.
- Focused API chat/scheduler tests pass, including assistant-run restart and stale-running recovery.
