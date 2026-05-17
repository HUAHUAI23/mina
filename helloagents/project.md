# Project Technical Conventions

## Stack
- Runtime: Bun 1.3.x
- API: Hono, Drizzle ORM v1 RC, PostgreSQL-ready repositories, in-memory local adapters
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

## Database Workflow
- During active development, use `bun --filter @mina/api db:push` to sync `apps/api/src/db/schema.ts` directly to the configured PostgreSQL database without writing migration files.
- Drizzle Kit is scoped to Mina-owned tables in the `public` schema so extension views and unrelated schemas are not treated as project objects.
- After the schema is finalized, generate and apply migrations with `db:generate` and `db:migrate`.
