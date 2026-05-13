# Development Standards

## Language

All repository-facing project text should remain in English:

- code comments
- documentation
- commit subjects
- pull request summaries
- environment variable names

## Repository Rules

1. Put deployable applications in `apps/*`.
2. Put shared libraries and tooling in `packages/*`.
3. Do not create nested workspace packages under `apps/**` or `packages/**`.
4. Every workspace package must declare `name`, `type`, `scripts`, and `exports` when it exposes code to other packages.

## Package Boundary Rules

1. Import through package entrypoints, never through another package's internal `src/*` paths.
2. Shared contracts belong in `@mina/contracts`.
3. Shared reusable UI primitives belong in `@mina/ui`.
4. Browser packages must not depend on Bun globals or Bun-only runtime modules.
5. API runtime composition belongs in `apps/api/src/app`.

## TypeScript Rules

1. Keep `strict` mode enabled.
2. Do not disable `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, or `verbatimModuleSyntax`.
3. Prefer inferred types from Zod schemas for API data models.
4. Use type-only imports when a value import is not required.
5. Add a shared TypeScript config change in `packages/typescript-config` before changing package-local compiler rules.

## API Rules

1. Routes only own HTTP concerns.
2. Services own business logic.
3. Repositories own persistence logic.
4. Data sources own static data or external adapters.
5. Validate request input with shared contracts.
6. Return explicit JSON payload shapes instead of naked primitives when the response may evolve.
7. Use top-level `notFound` and `onError` handlers in the root app.
8. Keep external generation providers behind the task provider registry; provider adapters must return pending results for in-progress async work instead of throwing.
9. Do not call external generation providers directly from workflow routes or request-time workflow reconciliation. Create durable queued tasks and let the scheduler/worker path start and poll them.
10. Use task idempotency keys for client-submitted task retries instead of creating duplicate provider jobs.

## Frontend Rules

1. Group UI by feature, not by file type alone.
2. Keep transport code in `features/*/api`.
3. Keep stateful server interactions in hooks.
4. Keep app shell concerns in `src/app`.
5. Do not place large inline style objects in React components.
6. Import shared shadcn/ui primitives through `@mina/ui/components/*`.
7. Keep Tailwind theme tokens and shadcn global styles in `packages/ui/src/styles/globals.css`.

## Environment Rules

1. Only variables prefixed with `VITE_` may be read in client code.
2. Never expose secrets through `VITE_*`.
3. Keep default development values in `.env.example`.
4. Parse environment values into typed config modules instead of reading raw strings throughout the codebase.
5. Use `@t3-oss/env-core` and Zod for environment validation in app runtime and build-tool configuration.

## Testing Rules

1. Every backend feature module should have at least one request-level test.
2. New API routes should be validated with Bun tests before merging.
3. Run `bun run check` before release or deployment.

## Dependency Rules

1. Prefer versions defined through the Bun workspace catalog.
2. Keep workspace-shared packages aligned unless there is a documented reason not to.
3. Pin Bun-facing type packages to the active runtime line when type/runtime drift would be risky.

## Documentation Rules

1. Update `docs/architecture.md` when package boundaries or layering change.
2. Update `docs/setup-and-operations.md` when commands or environment variables change.
3. Update the audit report when a major structural migration changes the engineering baseline.
