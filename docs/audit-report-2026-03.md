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
