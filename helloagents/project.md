# Project Technical Conventions

## Stack
- Runtime: Bun 1.3.x
- API: Hono, Drizzle ORM v1 RC, PostgreSQL-backed business repositories
- Web: Vite, React, shared `@mina/ui`
- Contracts: Zod schemas in `@mina/contracts`

## Development Rules
- Keep strict TypeScript settings enabled.
- Keep public API/client contracts in `packages/contracts`.
- Keep external providers and object storage behind ports/adapters.
- Use repository interfaces for persistence behavior and service classes for orchestration.

## Verification
- Main gates: `bun run typecheck`, `bun run test`, `bun run build`, `bun run check:boundaries`.
- API feature work should add Bun tests at service or request level.
- Regular API tests use explicit fakes under `apps/api/src/test` so production runtime remains PostgreSQL-only.

## Database Workflow
- During active development, use `bun --filter @mina/api db:push` to sync `apps/api/src/db/schema.ts` directly to the configured PostgreSQL database without writing migration files.
- Use `bun --filter @mina/api db:reset:push` to drop Mina-owned tables and immediately re-sync the development database.
- Use `bun --filter @mina/api db:create` and `db:drop` when the development database itself must be recreated; `db:migration:test` runs drop, create, generate, and migrate in sequence.
- API database command entrypoints live in `apps/api/scripts/db`; reusable schema and connection helpers live in `apps/api/src/db`.
- Drizzle Kit is scoped to Mina-owned tables in the `public` schema so extension views and unrelated schemas are not treated as project objects.
- After the schema is finalized, generate and apply migrations with `db:generate` and `db:migrate`.
