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
11. API errors must expose stable `error.code` values. Treat localized `error.message` as display text only.
12. Throw `HttpError` with English `fallbackMessage`, a semantic code, and a catalog `messageKey` whenever the error is user-facing.
13. Keep translation params primitive and safe to expose. Do not put secrets, stack traces, raw provider payloads, presigned URLs, SQL text, or credential-bearing URLs in `params`.
14. Use `apiValidator` for route validation so schema failures become `VALIDATION_FAILED` responses with structured `issues`.
15. Persist durable task/workflow errors as semantic code, message key, primitive params, and debug fallback text. Do not persist localized strings in business state.
16. Provider adapters and task lifecycle code should classify known provider failures into Mina/provider error categories and keep raw provider details in logs or debug fields.

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
15. User-visible UI text should use locale-bound messages from `useMessages()`. Do not add new hardcoded copy in JSX except brand names, user-authored data, provider/model identifiers, route paths, or test-only fixtures.
16. Use `I18nProvider` and `useI18n` for the current locale. Do not add feature-local locale state for global language selection, Paraglide global locale overrides, or route remount keys to force translated UI updates.
17. Send the current locale to API calls through the shared client header behavior instead of per-feature request code.
18. Use `@mina/i18n` formatter helpers for visible dates, times, and numbers. Keep API/storage timestamps as ISO strings.
19. Keep locale switches layout-stable. Do not clear React Query caches, reset auth state, or rewrite routes solely because the locale changed.
20. Use Tailwind's typography scale before arbitrary font sizes. Examples: use `text-xs` for 12px, `text-sm` for 14px, `text-base` for 16px, `text-xl` for 20px, and `text-2xl` for 24px. Only use `text-[...]` for a measured design value that is not represented by the Tailwind scale.
21. Use Tailwind's color tokens before arbitrary hex utilities. Use semantic theme classes such as `text-brand-accent`, `bg-gray-100`, `text-foreground`, and `text-foreground-secondary`; do not write `text-[#6911d4]` or `bg-[#f3f4f6]` when an equivalent token or Tailwind palette class exists. `#6911d4` is the product accent color and should be exposed through the shared brand-accent token. Add or update a theme token in `packages/ui/src/styles/globals.css` when a repeated product color needs a stable name.
22. Use Tailwind's spacing and sizing scale before arbitrary values. Classes such as `h-10`, `h-12`, `h-16`, `size-7`, `size-10`, `px-6`, `gap-20`, and `min-h-20` are preferred over equivalent `h-[...]`, `size-[...]`, `px-[...]`, or `gap-[...]` forms.
23. Reserve Tailwind arbitrary values for exact product geometry, CSS functions, and custom layout tracks that the scale cannot express. Convert measured pixel values to rem when they are kept as exact design geometry. Acceptable examples include a 295px app sidebar (`18.4375rem`), 258px fixed cards (`16.125rem`), 172px previews (`10.75rem`), `grid-template-columns: repeat(auto-fill, ...)`, `scrollbar-gutter`, and percentage-based preview art positioning.
24. Avoid resolving state styling conflicts with `!` modifiers. Prefer complete state class mappings or put the variant on the element that actually owns the style. For example, if global `a { color: inherit }` affects a link, put `text-brand-accent` on an inner text element and use `group-hover:text-brand-accent` instead of `!text-brand-accent`.
25. Prefer Tailwind primitives over arbitrary CSS effects. Use utilities such as `ring-1`, `ring-inset`, `ring-outline-ghost`, `border-*`, and `shadow-floating` before `shadow-[...]`, raw box shadows, or feature-local CSS. Handwritten CSS remains appropriate for pseudo-elements, generated preview art, third-party DOM, and CSS-variable geometry.
26. When deleting or replacing UI components, remove their unused style hooks in the same change. Delete stale class names, unused imported CSS files, and empty feature CSS files instead of leaving orphaned styles behind.
27. Render managed object-storage media through the shared `MediaImage`, `MediaVideo`, and `apps/web/src/lib/media-url.ts` helpers. Frontend DTOs and component state must not store or render direct presigned storage URLs; use stable API content endpoints and component-level refresh retries for images, video posters, and playable video.

## Internationalization Rules

1. `@mina/i18n` owns the first shared `en` and `zh-Hans` catalogs.
2. Add messages with semantic keys such as `workflow_canvas_run_button`, not English-text-derived identifiers.
3. Keep punctuation and surrounding words inside translations. Use params instead of string concatenation for variable content.
4. In web UI code, import messages through `apps/web/src/app/i18n-provider.tsx` (`useMessages()`) or the focused `apps/web/src/lib/i18n-messages.ts` adapter. Do not import `@mina/i18n/messages` directly outside that adapter, and do not import another package's internal `src/*` files.
5. Compile Paraglide output with `bun run i18n:compile` after catalog edits. Package scripts that depend on generated messages should run this step automatically.
6. When removing components, screens, routes, API errors, or other user-visible copy, delete the corresponding message keys from every locale catalog in the same change. Do not leave unused or stale translations behind.
7. Do not add locale-prefixed routes or database-backed user locale preferences without an explicit product and routing design update.

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
