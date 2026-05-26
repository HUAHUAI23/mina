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
8. Use Tailwind utilities as the default styling mechanism for ordinary `apps/web` UI: layout, spacing, typography, colors, radius, sizing, responsive rules, and local hover/focus/disabled states.
9. Add handwritten CSS only for explicit escape hatches: global reset/theme rules, third-party generated DOM overrides, SVG/path styling, pseudo-elements, CSS custom-property geometry, or cross-component state selectors that would be less maintainable as Tailwind arbitrary variants.
10. Do not add new feature-level style dumps to `apps/web/src/app/styles.css`; keep feature-owned CSS small and justified, and prefer colocated Tailwind classes or reusable UI components.
11. When a frontend task introduces a new styling convention or broad CSS exception, document the rule in project standards or a design guidance document so future work does not regress to all-handwritten CSS.
12. Prefer Tailwind's named scale and modern shorthand over arbitrary values: use classes such as `space-y-px`, `mt-px`, `rounded-sm`, `bg-linear-to-t`, and `border-(--token)` when they express the value cleanly. Arbitrary values are acceptable for project-specific geometry, CSS functions, third-party variables, or exact design values that do not fit the scale.
13. Keep Tailwind class names statically discoverable. For variants selected by data or props, map complete class strings instead of constructing class fragments dynamically.
14. Avoid high-cost GPU/compositing effects in app UI: do not use `backdrop-blur`, `filter: blur()`, `drop-shadow()`, `mix-blend-mode`, `mask-image`, or decorative opacity-plus-transform animations. Use flat color, borders, rings, and static shadows instead. React Flow transforms required for pan/zoom, node positioning, edge labels, and drag geometry are allowed as runtime interaction mechanics.

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
