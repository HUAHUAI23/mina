# Web Tailwind-First Styling Refactor Guidance

## Status

Date: 2026-05-22

Status: guidance for follow-up refactor tasks.

This document defines the target styling architecture for `apps/web`.
The immediate goal is to stop the application layer from accumulating
large all-handwritten CSS surfaces while preserving the few CSS use cases
that are genuinely better expressed outside Tailwind.

The current implementation already has Tailwind available through
`@mina/ui/globals.css`. The refactor is therefore an organization and
ownership change, not a tool adoption project.

## 1. Goal

Move `apps/web` to a Tailwind-first styling model:

1. Use Tailwind utilities for ordinary component layout, spacing,
   typography, colors, borders, radii, shadows, sizing, responsive
   behavior, hover/focus states, and disabled states.
2. Keep handwritten CSS only for cases where class-local utilities are
   materially worse: third-party DOM overrides, pseudo-elements,
   SVG/path styling, CSS custom-property state machines, global reset,
   and cross-component state selectors.
3. Reduce `apps/web/src/app/styles.css` from an application-wide style
   dump into a small set of explicit global and escape-hatch styles.
4. Preserve the visual direction in `apps/web/DESIGN.md`: zinc/white
   surfaces, floating UI, low-opacity depth, and restrained borders.
5. Add a durable project rule so future features do not reintroduce a
   full-handwritten-CSS default.

## 2. Current Baseline

Observed code shape:

1. `apps/web/src/main.tsx` imports `@mina/ui/globals.css` before
   `./app/styles.css`.
2. `packages/ui/src/styles/globals.css` imports Tailwind v4 and registers
   `apps/web/src` as a Tailwind source.
3. `packages/ui` components already use Tailwind utilities and `cn`.
4. `apps/web` application components mostly use semantic classes such as
   `mina-shell`, `mina-auth-card`, `mina-wc-node`, and `mina-wc-slot-item`.
5. `apps/web/src/app/styles.css` is about 3,000 lines and mixes base
   reset, app shell, auth, canvas list pages, plaza, workflow canvas,
   React Flow overrides, media stack behavior, and responsive rules.

The CSS file contains many selectors that Tailwind can replace directly:

1. Simple `display`, `grid`, `flex`, `gap`, `padding`, and `margin`.
2. Basic text size, color, weight, line-height, and truncation.
3. Basic rounded surfaces, fixed icon buttons, and hover states.
4. Simple responsive layout changes.
5. Form field shell styling.

It also contains legitimate handwritten CSS:

1. React Flow class overrides and generated DOM selectors.
2. SVG edge and connection line styling.
3. `::before` / `::after` visual assets.
4. Cross-component selectors such as
   `.react-flow__node.selected .mina-wc-node`.
5. CSS variable-driven interaction math such as media stack sizing,
   transforms, and hit areas.

## 3. Problem Statement

The current styling shape has four problems:

1. **No local ownership.** A small component change often requires
   editing a 3,000-line global stylesheet far from the component.
2. **Poor review signal.** Diff reviewers cannot quickly tell whether a
   style change is local, global, third-party override, or interaction
   state machinery.
3. **High regression risk.** Reused selectors such as `mina-wc-*` can
   affect multiple workflow canvas surfaces unintentionally.
4. **Wrong default.** New feature work can copy the existing pattern and
   add more global CSS even when Tailwind utilities would be clearer.

The target is not "zero CSS". The target is "CSS only where CSS is the
right abstraction".

## 4. Styling Ownership Rules

### 4.1 Tailwind First

For new `apps/web` UI code, the default must be Tailwind utilities in
`className`.

Use Tailwind for:

1. Component-local layout: `grid`, `flex`, `gap`, `items-*`,
   `justify-*`, `min-w-0`, `overflow-*`.
2. Component-local spacing: `p-*`, `px-*`, `py-*`, `m-*`, `mt-*`.
3. Typography: `text-*`, `font-*`, `leading-*`, `tracking-*`,
   `uppercase`, `truncate`.
4. Sizing: `h-*`, `w-*`, `min-h-*`, `max-w-*`, `aspect-*`.
5. State on the same element: `hover:*`, `focus-visible:*`,
   `disabled:*`, `data-[state=value]:*`, `aria-selected:*`.
6. Simple responsive behavior: `md:*`, `lg:*`, `max-*` variants.
7. Icon button and form field shells when the style does not rely on
   cross-component selector logic.

### 4.2 Handwritten CSS Is An Escape Hatch

Handwritten CSS is allowed only when at least one condition is true:

1. The selector targets third-party generated DOM or classes
   (`react-flow__node`, `react-flow__handle`, `react-flow__panel`).
2. The selector styles SVG paths, hit areas, stroke dash behavior, or
   path pointer events.
3. The style needs `::before` / `::after` and adding real markup would be
   worse than the pseudo-element.
4. The behavior depends on CSS custom properties produced by runtime
   code or geometry constants.
5. The selector expresses a parent-child state relationship that cannot
   be localized without adding non-semantic wrapper markup.
6. The rule is a true global reset, theme token declaration, or
   third-party library variable override.
7. The rule intentionally centralizes a shared primitive that is reused
   broadly and should not be duplicated in JSX.

When adding handwritten CSS, include a short comment only if the reason
is not obvious from the selector.

### 4.3 No New Global Style Dumps

Do not add new broad application feature styles to
`apps/web/src/app/styles.css` by default.

Acceptable additions to `styles.css`:

1. Base reset and app-root behavior.
2. Temporary legacy rules during migration.
3. Explicit third-party override sections.
4. CSS that meets the handwritten escape-hatch rules above.

For all ordinary component styles, prefer Tailwind in the component file
or a small reusable component in `@mina/ui` / feature-local component
code.

## 5. Required Norm Persistence

This refactor has a mandatory documentation deliverable:

1. Persist the Tailwind-first rule in the project standards, currently
   `docs/development-standards.md`.
2. Keep this guidance document linked or referenced by future frontend
   refactor plans.
3. If a follow-up task introduces new handwritten CSS, that task must
   state why the rule belongs in CSS instead of Tailwind.
4. Code review should reject new feature-level all-handwritten CSS
   unless it satisfies the escape-hatch criteria.

This requirement exists to prevent the project from drifting back to a
single global stylesheet as the default styling mechanism.

## 6. Token And Theme Work

Before broad migration, make Tailwind classes readable by exposing Mina
surface tokens through the Tailwind v4 theme.

Current `@theme inline` covers standard shadcn tokens such as
`background`, `foreground`, `card`, `primary`, `secondary`, `muted`, and
`accent`. The application also heavily uses Mina-specific tokens:

1. `surface`
2. `surface-container-lowest`
3. `surface-container-low`
4. `surface-container`
5. `surface-container-high`
6. `surface-container-highest`
7. `foreground-secondary`
8. `foreground-tertiary`
9. `foreground-quaternary`
10. `foreground-faint`
11. `outline-ghost`

Add explicit Tailwind theme aliases in
`packages/ui/src/styles/globals.css`, for example:

```css
@theme inline {
  --color-surface: var(--surface);
  --color-surface-container-lowest: var(--surface-container-lowest);
  --color-surface-container-low: var(--surface-container-low);
  --color-surface-container: var(--surface-container);
  --color-surface-container-high: var(--surface-container-high);
  --color-surface-container-highest: var(--surface-container-highest);
  --color-foreground-secondary: var(--foreground-secondary);
  --color-foreground-tertiary: var(--foreground-tertiary);
  --color-foreground-quaternary: var(--foreground-quaternary);
  --color-foreground-faint: var(--foreground-faint);
  --color-outline-ghost: var(--outline-ghost);
}
```

This avoids noisy classes such as
`bg-[var(--surface-container-lowest)]` in routine UI.

## 7. Refactor Classification

Use this classification before changing each block of CSS.

| Category | Default Action | Examples |
|---|---|---|
| Base reset / root sizing | Keep CSS | `html, body, #root`, `button`, `input`, `.sr-only` |
| Design tokens | Keep in `@mina/ui/globals.css` | `--surface-*`, `--foreground-*`, `@theme inline` |
| Simple app shell | Migrate to Tailwind | `mina-shell`, `mina-nav-island`, `mina-brand`, `mina-profile` |
| Simple page layouts | Migrate to Tailwind | projects, canvas list, plaza |
| Simple cards/buttons/forms | Migrate to Tailwind or shared components | primary action, icon button, form field |
| Decorative pseudo-elements | Keep CSS unless markup is clearer | preview gradients, auth underlay |
| Third-party overrides | Keep CSS | React Flow nodes, handles, panels |
| SVG edge styling | Keep CSS | media edges, connection lines |
| Runtime CSS variable geometry | Keep CSS | media stack width, handle hit size, transform math |
| Cross-component data-state chains | Usually keep CSS | attachment stack collapsed/expanded rules |

## 8. Module-by-Module Guidance

### 8.1 Base And Global Tokens

Keep handwritten CSS for:

1. root document sizing and overflow.
2. inherited form fonts.
3. link reset.
4. `.sr-only`.

Move design tokens to `packages/ui/src/styles/globals.css` when they are
shared by Tailwind and shadcn primitives. Avoid defining theme-like
tokens only in `apps/web/src/app/styles.css`.

### 8.2 App Shell

Primary files:

1. `apps/web/src/app/app-shell.tsx`
2. `apps/web/src/app/styles.css`

Recommended action: migrate most app-shell styles to Tailwind.

Good Tailwind candidates:

1. `mina-shell`
2. `mina-nav-island`
3. `mina-brand`
4. `mina-brand-mark`
5. `mina-brand-name`
6. `mina-nav-section`
7. `mina-section-label`
8. `mina-nav-list`
9. `mina-nav-link`
10. `mina-project-link`
11. `mina-project-thumb`
12. `mina-new-project`
13. `mina-workspace`
14. `mina-topbar`
15. `mina-profile`
16. `mina-avatar`
17. `mina-logout`
18. `mina-route-frame`
19. `mina-verify-note`

Keep or extract CSS for:

1. dotted shell background if the class becomes unreadable.
2. responsive app-shell reshaping if Tailwind variants make JSX too
   long; otherwise migrate with `lg:` / `max-lg:` style variants.

### 8.3 Auth Gate

Primary file:

1. `apps/web/src/features/auth/components/auth-gate.tsx`

Recommended action: migrate form, layout, tab, button, and field shells
to Tailwind.

Keep CSS only for:

1. `mina-auth-underlay::after` overlay if the pseudo-element remains.
2. visual artboard gradients if they stay decorative and independent of
   component behavior.

Prefer converting some decorative pseudo-elements into explicit
`aria-hidden` spans/divs if it makes Tailwind simpler and the markup is
not misleading.

### 8.4 Projects And Canvas List Pages

Primary files:

1. `apps/web/src/features/projects/components/projects-page.tsx`
2. `apps/web/src/features/canvas/components/canvas-page.tsx`

Recommended action: migrate almost entirely to Tailwind.

Good candidates:

1. page grids.
2. section headings.
3. action buttons.
4. folder/canvas cards.
5. upload/new cards.
6. avatar stack.
7. recent canvas grid.

Keep CSS only for preview pseudo-elements and tone-specific gradient
artwork unless real child elements are preferred.

### 8.5 Plaza Page

Primary file:

1. `apps/web/src/features/plaza/components/plaza-page.tsx`

Recommended action: migrate almost entirely to Tailwind.

Keep CSS only for:

1. unusually complex hero font clamp if keeping it inline would reduce
   readability.
2. any decorative background that remains pseudo-element-based.

### 8.6 Workflow Canvas Shell

Primary files:

1. `apps/web/src/features/workflow-canvas/components/WorkflowCanvasPage.tsx`
2. `apps/web/src/features/workflow-canvas/components/WorkflowCanvas.tsx`

Mixed action:

Migrate ordinary layout to Tailwind:

1. `mina-wc-page`
2. `mina-wc-header`
3. `mina-wc-title-group`
4. `mina-wc-title-copy`
5. `mina-wc-header-actions`
6. simple loading/empty states

Keep CSS for:

1. React Flow root variable overrides.
2. React Flow panel positioning when it uses generated class names.
3. canvas dotted background if Tailwind arbitrary syntax becomes hard to
   read.
4. performance-sensitive canvas interaction styles documented in
   `helloagents/wiki/modules/workflows.md`.

### 8.7 React Flow Nodes, Handles, And Edges

Primary files:

1. `components/nodes/*`
2. `components/edges/*`
3. `workflow-canvas-geometry.ts`

Recommended action: keep the interaction-critical CSS handwritten.

Keep CSS for:

1. `.react-flow__node` and selected/dragging selectors.
2. `.react-flow__handle` target/source placement.
3. handle hit zone CSS variables.
4. handle orb pseudo-elements.
5. SVG path stroke, hit zone, dash, and pointer-event rules.
6. connection line styling.

Possible Tailwind candidates:

1. node header layout.
2. placeholder text layout.
3. media preview shells if they do not need React Flow selector context.
4. text/group node simple surfaces.

Do not migrate a React Flow rule if the result requires long arbitrary
variants that are harder to verify than the CSS selector.

### 8.8 Composer, Dock, And Form Controls

Primary files:

1. `components/dock/CanvasDock.tsx`
2. `composer/blocks/*`
3. `forms/form-context.tsx`
4. `forms/field-groups/*`

Recommended action: migrate ordinary control and layout styling to
Tailwind or shared local components.

Good Tailwind candidates:

1. panel headings.
2. model toolbar layout.
3. mode chips.
4. icon toggles.
5. credit line.
6. empty prompt bar basic layout.
7. multi-selection panel.
8. form fields and error text.

Keep CSS for:

1. `CanvasDock` positioning on React Flow `Panel` when matching
   `.react-flow__panel`.
2. composer prompt safe inset variables.
3. attachment layer pointer event rules.
4. collapsed/expanded stack state relationships that depend on parent
   data attributes.

### 8.9 Media Slot Stack

Primary files:

1. `components/media-slots/*`
2. `composer/slots/MediaStackSlotRenderer.tsx`

Recommended action: keep the stack geometry and state machine CSS, but
migrate simple child visuals where clean.

Keep CSS for:

1. collapsed vs expanded overlap.
2. `--composer-media-width`.
3. `--slot-stack-index`, `--slot-stack-total`, and
   `--slot-stack-rotate`.
4. drag portal fixed positioning.
5. drag overlay.
6. data-state selectors for empty, dragging, uploading, and outside-drop.
7. pointer-events gating for the absolute attachment layer.

Tailwind candidates:

1. static thumbnail shell if the variable width remains on a wrapper.
2. close button base shape.
3. index badge base shape.
4. tab button base styles.

If migration would split one interaction state across JSX and CSS in a
way that makes the stack harder to reason about, keep it in CSS.

## 9. Target File Shape

The final state should avoid one application-wide styling file. A
reasonable target is:

```text
apps/web/src/app/styles.css
  - base reset
  - app-level global behavior only

apps/web/src/features/workflow-canvas/workflow-canvas.css
  - React Flow overrides
  - SVG edge styles
  - CSS variable geometry
  - media stack state rules

packages/ui/src/styles/globals.css
  - Tailwind import
  - @source registration
  - design tokens
  - theme aliases
  - shadcn base layer
```

Do not split CSS by file type just to split it. Split only when a block
has clear ownership and remains a justified CSS escape hatch.

## 10. Component Extraction Guidance

Prefer component extraction when the same Tailwind class cluster repeats
three or more times.

Good candidates:

1. `IconButton`
2. `SurfaceCard`
3. `PillButton`
4. `FieldShell`
5. `PanelHeading`
6. `ToolbarSelect`
7. `EmptyStateText`

Location rules:

1. Put broadly reusable primitives in `packages/ui`.
2. Put workflow-specific primitives under
   `apps/web/src/features/workflow-canvas/components` or a local
   composer folder.
3. Do not create a shared primitive just to avoid one className string.

## 11. Migration Sequence

### Phase 0: Guardrails

1. Add Tailwind aliases for Mina surface and foreground tokens.
2. Add project-standard rules that make Tailwind-first the default.
3. Add this document to follow-up task references.
4. Keep visual snapshots or Playwright screenshots available for pages
   being migrated.

### Phase 1: Low-Risk Pages

Migrate page-level UI with minimal state coupling:

1. plaza page.
2. projects page.
3. canvas list page.
4. app shell.

Acceptance:

1. Deleted CSS blocks map directly to component-local Tailwind classes.
2. No React Flow or media stack rules are touched.
3. Desktop and mobile layouts remain equivalent.

### Phase 2: Auth

Migrate auth layout, tabs, fields, and buttons.

Acceptance:

1. Login/register modes still work.
2. Field focus, password visibility button, error text, pending disabled
   state, and mobile layout are visually equivalent.
3. Decorative art can remain CSS if migration adds noise.

### Phase 3: Workflow Ordinary UI

Migrate non-React-Flow workflow UI:

1. headers and loading states.
2. toolbar button shells.
3. history card rows.
4. config toolbar controls.
5. panel headings.
6. form fields.
7. multi-selection panel.

Acceptance:

1. No change to Yjs, React Flow handlers, dnd-kit behavior, or media slot
   ordering.
2. Typecheck passes.
3. Existing workflow canvas Playwright coverage passes if touched.

### Phase 4: CSS Escape Hatch Split

Move remaining justified CSS into feature-owned CSS files.

Acceptance:

1. `apps/web/src/app/styles.css` contains only global app styles.
2. Workflow-specific handwritten CSS is imported from the workflow
   feature entrypoint or a clearly-owned module.
3. Every remaining CSS block satisfies the escape-hatch rules.

### Phase 5: Cleanup And Enforcement

1. Remove stale semantic classes that no longer have CSS.
2. Add or update lint/review checklist documentation if available.
3. Update `helloagents/wiki/modules/workflows.md` if workflow styling
   ownership or performance constraints materially change.
4. Keep `docs/development-standards.md` aligned with the final rules.

## 12. Review Checklist

Use this checklist on every styling refactor pull request:

1. Does every new ordinary component style use Tailwind by default?
2. If new CSS was added, is it justified by the escape-hatch list?
3. Did the PR avoid adding broad selectors to `apps/web/src/app/styles.css`?
4. Are design tokens expressed through Tailwind theme aliases instead of
   repeated raw CSS variables when possible?
5. Did the change avoid duplicating long Tailwind class clusters that
   should be extracted into a component?
6. Did the change avoid moving React Flow interaction-critical CSS into
   unreadable arbitrary variants?
7. Are responsive states verified on desktop and mobile?
8. Did the PR update project standards when it introduced or refined a
   styling convention?

## 13. Verification Plan

Minimum verification depends on touched scope:

1. Token or global Tailwind source changes:
   - `bun run typecheck:web`
   - `bun run build:web`
2. Low-risk page migrations:
   - `bun run typecheck:web`
   - manual desktop/mobile screenshot review
3. Auth migration:
   - `bun run typecheck:web`
   - manual login/register mode check
4. Workflow canvas migration:
   - `bun run typecheck:web`
   - `bunx playwright test tests/workflow-canvas.spec.ts --project=chromium`
   - any focused unit tests for touched workflow canvas helpers
5. CSS file moves:
   - `bun run build:web`
   - verify imported CSS order does not change token availability

## 14. Risks And Mitigations

### Risk: JSX Becomes Noisy

Tailwind can make component files hard to scan if every repeated surface
is inlined.

Mitigation: extract repeated class clusters into small components or
local constants. Use `cn` for conditional state.

### Risk: Arbitrary Variants Replace Clear CSS

Complex selectors can technically be encoded in Tailwind, but the result
can be harder to understand than CSS.

Mitigation: keep third-party and interaction state selectors in CSS.

### Risk: Token Migration Produces Raw Variable Noise

Without Tailwind aliases, classes such as
`bg-[var(--surface-container-lowest)]` will proliferate.

Mitigation: add theme aliases before migrating broad UI.

### Risk: Workflow Canvas Performance Regressions

The workflow canvas has documented performance constraints. Styling
changes can accidentally reintroduce costly filters, animations, or
transform transitions.

Mitigation: preserve the workflow performance guidance from
`helloagents/wiki/modules/workflows.md`; avoid active-canvas
`backdrop-filter`, SVG drop-shadow filters, pulse/flow animations, and
expensive transition-driven transform effects unless separately
measured.

## 15. Non-Goals

1. Do not rewrite `@mina/ui` primitives; they already follow a Tailwind
   utility model.
2. Do not migrate all CSS to Tailwind.
3. Do not redesign the visual system.
4. Do not change workflow canvas behavior, media slot ordering, Yjs
   state flow, or React Flow ownership as part of styling migration.
5. Do not remove semantic class names that are needed as integration
   anchors for React Flow, tests, or complex CSS.

## 16. Definition Of Done

The styling refactor is complete when:

1. New ordinary `apps/web` UI defaults to Tailwind utilities.
2. `apps/web/src/app/styles.css` no longer owns unrelated feature
   styling.
3. Remaining handwritten CSS is small, feature-owned, and justified by
   the escape-hatch rules.
4. Tailwind theme aliases cover the Mina surface and foreground tokens.
5. Project standards document the Tailwind-first rule.
6. Workflow canvas interaction and performance tests still pass.
