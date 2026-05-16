# Project Technical Conventions

## Stack
- Runtime: Bun 1.3.x
- API: Hono, Drizzle ORM, PostgreSQL-ready repositories, in-memory local adapters
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
