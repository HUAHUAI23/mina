# Backend Refactor Guidance

## Status

Date: 2026-05-13

This document is a refactoring guide, not an implementation record. It should be used before changing backend structure in `apps/api` or shared schemas in `packages/contracts`.

## Goals

1. Keep the backend simple enough to reason about under production pressure.
2. Preserve the current API behavior while reducing coupling in `tasks` and `workflows`.
3. Make module boundaries explicit without introducing framework-heavy architecture.
4. Avoid fragile barrel export chains in build-sensitive API and client type paths.
5. Prepare authorization boundaries for admin-only public resource management.
6. Keep frontend and UI behavior unchanged unless a separate UI task explicitly requires it.

## Non-Goals

1. Do not rewrite the API framework. Hono is already a good fit for this project.
2. Do not introduce a new dependency injection framework.
3. Do not move business logic into `packages/contracts`.
4. Do not redesign the web UI as part of this backend refactor.
5. Do not implement user-to-public-resource sharing yet. The current authorization focus is admin management.

## Reference Basis

The recommendations below combine current repository facts with external engineering references:

1. Hono supports composing grouped route applications with `app.route()` and `basePath()`, which matches the current `src/app/api-router.ts` route graph pattern: <https://hono.dev/api/routing>
2. Hono RPC typing works best when route chains preserve inference; large apps can split routes but should still export a stable route type from the composed app: <https://hono.dev/docs/guides/rpc>
3. NestJS documents modules as a way to group related controllers and providers into cohesive application units. The principle is relevant even though this project is not using Nest: <https://docs.nestjs.com/modules>
4. The Node.js best practices project recommends structuring applications around business components rather than only technical layers: <https://github.com/goldbergyoni/nodebestpractices>
5. Hexagonal architecture guidance keeps business logic independent from adapter and infrastructure details. Use this as a dependency-direction rule, not as a reason to add unnecessary layers: <https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/hexagonal-architecture.html>
6. Large Class and Long Method refactoring guidance supports extracting cohesive responsibilities when files mix too many reasons to change: <https://refactoring.guru/smells/large-class>
7. `import/no-cycle` is a practical guardrail for module boundary health once linting exists in this repository: <https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-cycle.md>
8. Tailwind's class detection relies on complete class names in source files; dynamic class construction and unnecessary arbitrary values make styling harder to verify: <https://tailwindcss.com/docs/detecting-classes-in-source-files>
9. Tailwind v4 renamed several utilities, including gradient utilities such as `bg-linear-*`: <https://tailwindcss.com/docs/upgrade-guide>
10. Web animation performance guidance favors avoiding layout and paint work. This repository applies a stricter local rule: do not introduce blur/filter/blend/mask effects or opacity/transform animations unless a separate performance review approves them: <https://web.dev/articles/animations-guide>
11. MDN warns that `will-change` should be used carefully because overuse can consume resources: <https://developer.mozilla.org/en-US/docs/Web/CSS/will-change>
12. OWASP authorization guidance supports least privilege, server-side enforcement, and deny-by-default policies: <https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html>
13. NN/g usability heuristics emphasize visibility, consistency, error prevention, and user control. For Mina, this means operational UI should stay predictable and task-focused: <https://www.nngroup.com/articles/ten-usability-heuristics/>

## Current Repository Findings

The current backend already has a useful layering baseline:

```text
apps/api/src/app/create-app.ts
apps/api/src/app/api-router.ts
apps/api/src/app/dependencies.ts
apps/api/src/modules/<feature>/*.routes.ts
apps/api/src/modules/<feature>/*.service.ts
apps/api/src/modules/<feature>/*.repository.ts
packages/contracts/src/modules/<feature>/*.schemas.ts
```

The existing project documentation in `docs/development-standards.md` already says:

1. API runtime composition belongs in `apps/api/src/app`.
2. Routes own HTTP concerns.
3. Services own business logic.
4. Repositories own persistence logic.
5. Shared contracts belong in `@mina/contracts`.

The main structural pressure is not the presence of module-local route files. The main pressure is file-level responsibility drift inside `tasks` and `workflows`.

Current hotspots:

```text
apps/api/src/modules/tasks/tasks.service.ts                 554 lines
apps/api/src/modules/workflows/execution.ts                 433 lines
apps/api/src/modules/workflows/workflows.service.ts          243 lines
apps/api/src/modules/workflows/workflows.drizzle-repository.ts 276 lines
apps/api/src/modules/tasks/tasks.drizzle-repository.ts       248 lines
packages/contracts/src/modules/tasks/task.schemas.ts         214 lines
packages/contracts/src/modules/workflows/workflow.schemas.ts 124 lines
```

`tasks.service.ts` currently mixes:

1. Task use cases.
2. Task entity construction.
3. Pricing request construction.
4. Provider start and poll state handling.
5. Retry and backoff calculation.
6. Resource mapping.
7. Event recording.
8. Environment-bound timing decisions.

`workflows/execution.ts` currently mixes:

1. Run reconciliation.
2. Flow-group execution scheduling.
3. Node state transitions.
4. Media input resolution.
5. Task config assembly.
6. Missing-media policy.
7. Run finalization and event recording.

These files are doing too many unrelated jobs. They should be decomposed, but the refactor should be staged so route behavior, scheduler behavior, task lifecycle semantics, and workflow execution semantics remain stable.

## Route Location Decision

### Question

Should `tasks`, `workflows`, and `health` route files live under `apps/api/src/modules/*`, or should all routes move into a top-level `apps/api/src/routes` directory?

### Answer

For this repository, keep feature route factories close to their modules:

```text
apps/api/src/modules/tasks/tasks.routes.ts
apps/api/src/modules/workflows/workflows.routes.ts
apps/api/src/modules/health/health.routes.ts
```

Keep only the route graph composition in the app layer:

```text
apps/api/src/app/api-router.ts
apps/api/src/app/create-app.ts
```

This is the best fit for the current project because:

1. The project already uses feature modules under `apps/api/src/modules`.
2. Hono officially supports composing sub-apps with `route()`, so module-local route factories are compatible with the framework.
3. Feature-based modules keep HTTP handlers, service facades, repositories, tests, and module helpers close to the domain they serve.
4. A top-level `src/routes` folder would create a horizontal technical layer that scatters feature code across `routes`, `services`, `repositories`, and `modules`.
5. The current `src/app/api-router.ts` already provides the central route map that a top-level `routes` directory is usually meant to provide.

`apps/api/src/client.ts` is a separate concern. It is the exported typed client surface for `@mina/api/client`; it is not a route implementation folder. It can stay at `src/client.ts` because `apps/api/package.json` exports `./client` from that path.

### When a Top-Level `routes` Directory Would Be Acceptable

A top-level `apps/api/src/routes` directory is acceptable only if it contains API-wide adapters, not feature logic. Examples:

```text
apps/api/src/routes/openapi.ts
apps/api/src/routes/health-check-aliases.ts
apps/api/src/routes/route-manifest.ts
```

Do not move `tasks.routes.ts` or `workflows.routes.ts` there just to group route files by file type.

## Target Backend Principles

### Dependency Direction

Use this dependency direction:

```text
app composition
  -> module http routes
    -> application service/use case
      -> domain facts and pure utilities
      -> repository ports
      -> provider ports
        -> infrastructure adapters
```

Rules:

1. `app/*` may import modules and infrastructure factories.
2. `*.routes.ts` may import Hono, validators, contracts, and the public service facade.
3. Services must not import Hono or request/response objects.
4. Domain and utility files must not import Hono, database clients, provider SDKs, or environment config.
5. Repositories may import database schema and schema validators.
6. Provider adapters may import vendor SDKs and provider-specific config, but provider ports must not.
7. `packages/contracts` must not import from `apps/*`.

### Module File Roles

Use these roles consistently:

```text
domain.ts
```

Facts and domain predicates only:

1. Constants.
2. Capability maps.
3. Domain type aliases.
4. Status predicates such as `isTerminalTask`.
5. Pure classification such as task mode from task kind.

No HTTP, no DB, no environment reads, no provider calls.

```text
util.ts
```

Pure transformation and construction helpers:

1. Normalization.
2. Resource mapping.
3. Stable ID payload construction when ID generation is injected.
4. Pricing input construction if it is deterministic and provider-independent.
5. Task config assembly from already-resolved inputs.

No side effects except deterministic object construction.

```text
vendor.ts
```

Third-party request assembly and API calls:

1. Vendor request payload mapping.
2. Vendor response normalization.
3. Transport error translation.
4. Provider-specific polling and cancellation.

No Hono route handling. No database writes. No workflow orchestration.

For modules with several vendor providers, prefer:

```text
providers/<provider>.vendor.ts
providers/provider.ts
providers/registry.ts
```

over a single large `vendor.ts`.

### Service Role

Service files should be application facades. They should read like use cases, not like utility libraries.

Good service methods:

```text
createTask
getTask
listTasks
cancelTask
startQueuedTasks
pollAsyncTasks
createWorkflow
createRun
cancelRun
reconcileRunningRuns
```

Avoid burying low-level state machine details inside the public service file. Extract those details into small collaborators with narrow APIs.

## Recommended Target Structure

### API App Layer

Keep:

```text
apps/api/src/app/
  api-router.ts
  create-app.ts
  dependencies.ts
  background-scheduler.ts
```

Optional later additions:

```text
apps/api/src/app/
  request-context.ts
  auth-middleware.ts
```

Use `app/api-router.ts` as the only central API route graph:

```text
new Hono()
  .basePath('/api')
  .route('/health', createHealthRoutes())
  .route('/posts', createPostsRoutes(postsService))
  .route('/tasks', createTasksRoutes(tasksService))
  .route('/workflows', createWorkflowsRoutes(workflowsService))
  .route('/workflow-runs', createWorkflowRunsRoutes(workflowsService))
```

Do not put business rules in this file.

### Tasks Module

Target structure:

```text
apps/api/src/modules/tasks/
  tasks.routes.ts
  tasks.service.ts
  tasks.repository.ts
  tasks.drizzle-repository.ts
  task-events.ts
  domain.ts
  pricing.ts
  resources.ts
  retry.ts
  lifecycle.ts
  providers/
    provider.ts
    registry.ts
    dev.provider.ts
```

Responsibility split:

```text
domain.ts
```

1. `taskKindFromConfig`.
2. `taskModeFromKind`.
3. `providerFromConfig`.
4. `modelFromConfig`.
5. Terminal/running/queued predicates.
6. Provider result status type guards if needed.

```text
pricing.ts
```

1. `videoPricingKeyFromConfig`.
2. `pricingInputFromConfig`.
3. `actualCostFromUsage`.

Keep pricing logic independent from repository and provider calls.

```text
resources.ts
```

1. `taskResourceFromInput`.
2. `taskResourceFromOutput`.
3. Resource metadata payload helpers if they are resource-specific.

```text
retry.ts
```

1. `boundedDelay`.
2. `nextRetryAtFromProviderDelay`.
3. `nextRetryAtFromPendingDelay`.
4. `nextRetryAtFromTransportError`.
5. Expiration checks.

Environment values should be passed into these functions or wrapped in a small config object. This keeps retry math testable without relying on global `apiEnv`.

```text
lifecycle.ts
```

1. Convert provider start results into task updates.
2. Convert provider poll results into task updates.
3. Terminal state construction for succeeded, failed, and cancelled tasks.
4. Transient field cleanup such as removing `nextRetryAt` and stale `error`.

This file may depend on `pricing.ts`, `resources.ts`, `retry.ts`, repository ports, and event log ports. It should not know Hono.

```text
providers/provider.ts
```

1. `TaskProvider`.
2. `ProviderStartResult`.
3. `ProviderPollResult`.
4. `ProviderUsage`.

```text
providers/registry.ts
```

1. `TaskProviderRegistry`.

```text
providers/dev.provider.ts
```

1. `DevTaskProvider`.
2. Dev-only output construction.

The public `TasksService` should remain a small facade over repository, pricing, lifecycle, and provider registry. Existing callers should not need to know about the split.

### Workflows Module

Target structure:

```text
apps/api/src/modules/workflows/
  workflows.routes.ts
  workflow-runs.routes.ts
  workflows.service.ts
  workflow-runs.service.ts
  workflows.repository.ts
  workflows.drizzle-repository.ts
  workflow-events.ts
  domain.ts
  graph.ts
  validation.ts
  media-selection.ts
  task-config.ts
  run-state.ts
  run-executor.ts
  node-executor.ts
```

Responsibility split:

```text
domain.ts
```

1. Workflow node type predicates.
2. Run mode facts.
3. Run/node status predicates.
4. Any constants that define stable workflow behavior.

`graph.ts` can stay separate because it already has a clear graph traversal role. If `domain.ts` would only re-export graph predicates, do not create it just for symmetry.

```text
media-selection.ts
```

1. `slotToInputRole`.
2. `slotToResourceKind`.
3. `findOutputBySelector`.
4. `findOutputByMediaView`.
5. `mediaInputFromOutput`.
6. `mediaInputFromResourceRef`.

```text
task-config.ts
```

1. `buildImageTaskConfig`.
2. `buildVideoTaskConfig`.
3. `collectInputResources`.

This separates media lookup from task config assembly.

```text
run-state.ts
```

1. `createInitialNodeStates`.
2. `finishRunIfSettled`.
3. Failed run/node state builders.
4. Pure state transition helpers.

Where possible, make these pure helpers return next objects. Repository writes should stay in services/executors.

```text
node-executor.ts
```

1. Execute or observe one node.
2. Create node task.
3. Link task to node.
4. Resolve node terminal state from task terminal state.

```text
run-executor.ts
```

1. Reconcile one run.
2. Reconcile all running runs.
3. Select isolated-node vs flow-group execution.
4. Iterate flow-group DAG order.

```text
workflow-runs.service.ts
```

1. `createRun`.
2. `getRun`.
3. `listRuns`.
4. `cancelRun`.
5. `reconcileRun`.
6. `reconcileRunningRuns`.

`workflows.service.ts` should focus on workflow definitions:

1. `createWorkflow`.
2. `getWorkflow`.
3. `listWorkflows`.
4. `updateWorkflow`.
5. `deleteWorkflow`.
6. `updateNodeMediaView`.
7. `getNodeTasks`.

The existing `WorkflowsService` can initially remain as a compatibility facade while the internals split. Avoid breaking scheduler and route dependencies in the same patch that extracts internals.

### Health Module

`health` can remain small:

```text
apps/api/src/modules/health/health.routes.ts
```

If health checks later include database, storage, or provider readiness, split them this way:

```text
apps/api/src/modules/health/
  health.routes.ts
  health.service.ts
  checks.ts
```

Until then, avoid adding structure.

## Contracts Package Guidance

Current package:

```text
packages/contracts/src/index.ts
```

exports every module:

```ts
export * from './modules/accounts/account.schemas'
export * from './modules/canvas/canvas.schemas'
export * from './modules/posts/post.schemas'
export * from './modules/pricing/pricing.schemas'
export * from './modules/tasks/task.schemas'
export * from './modules/workflows/workflow.schemas'
```

This is acceptable as the stable package root API. It should not be used as a dumping ground for temporary helpers.

Recommended package exports:

```json
{
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    },
    "./modules/accounts": {
      "types": "./src/modules/accounts/account.schemas.ts",
      "default": "./src/modules/accounts/account.schemas.ts"
    },
    "./modules/tasks": {
      "types": "./src/modules/tasks/task.schemas.ts",
      "default": "./src/modules/tasks/task.schemas.ts"
    },
    "./modules/workflows": {
      "types": "./src/modules/workflows/workflow.schemas.ts",
      "default": "./src/modules/workflows/workflow.schemas.ts"
    },
    "./modules/pricing": {
      "types": "./src/modules/pricing/pricing.schemas.ts",
      "default": "./src/modules/pricing/pricing.schemas.ts"
    },
    "./modules/posts": {
      "types": "./src/modules/posts/post.schemas.ts",
      "default": "./src/modules/posts/post.schemas.ts"
    },
    "./modules/canvas": {
      "types": "./src/modules/canvas/canvas.schemas.ts",
      "default": "./src/modules/canvas/canvas.schemas.ts"
    }
  }
}
```

Then build-sensitive API modules can import only the contracts they need:

```ts
import type { Task, TaskResource } from '@mina/contracts/modules/tasks'
import { TaskParamsSchema } from '@mina/contracts/modules/tasks'
```

Guidelines:

1. Keep `@mina/contracts` root export as the stable public convenience API.
2. Prefer module subpath exports in `apps/api` and other build-sensitive paths.
3. Do not create nested barrel chains inside `packages/contracts/src/modules/*`.
4. Do not put backend-only domain services in contracts.
5. Do not export temporary helper functions from contracts.
6. After changing exports, run at least `bun run typecheck:contracts` and `bun run build:api`.

## Hono Client Type Guidance

Current `apps/api/src/client.ts` defines a manual `ClientSchema` and exports:

```ts
export type AppType = Hono<BlankEnv, ClientSchema, '/'>
```

This keeps `@mina/api/client` type-only and avoids importing server runtime code into the web app. The tradeoff is schema drift: routes and client type can diverge.

Preferred future direction:

1. Keep `src/client.ts` as the public `@mina/api/client` export path.
2. Avoid broad `: Hono` return annotations on route factories if relying on Hono's inferred RPC route type. Those annotations erase route schema inference.
3. Consider deriving `AppType` from the composed Hono route graph only if it does not pull runtime-only dependencies into the web build.
4. If manual `ClientSchema` stays, add request-level route tests that cover every endpoint listed in `ClientSchema`.
5. Keep contracts as the DTO/schema source of truth. The client schema should describe transport shape, not redefine business rules.

Practical rule: do not change route typing and module decomposition in the same patch. First stabilize behavior, then improve type generation.

## Barrel Export Rules

Use these rules across the backend:

1. Source functions should be imported from their owning module.
2. Re-export only stable public API surfaces.
3. Do not use barrels for incidental helpers.
4. Do not cross more than one re-export layer.
5. Avoid barrels in API route composition, server vendor adapters, instrumentation, scheduler, and contracts-heavy paths.
6. After changing shared exports, run a build, not just unit tests.

Allowed:

```ts
import { pricingInputFromConfig } from './pricing'
import { TaskProviderRegistry } from './providers/registry'
```

Avoid:

```ts
import { pricingInputFromConfig, TaskProviderRegistry } from './index'
```

## Authorization Design

The repository already has:

```ts
UserRoleSchema = z.enum(['user', 'admin'])
```

Authorization should be added with server-side policy checks and deny-by-default behavior.

Target concepts:

```text
apps/api/src/modules/accounts/
  accounts.data.ts
  auth-context.ts
  authorization.ts
```

`auth-context.ts`:

1. Represents the current actor.
2. Contains user id, account id, and role.
3. Has a development fallback only when the environment explicitly allows it.

`authorization.ts`:

1. `assertAdmin(actor)`.
2. `assertAccountMember(actor, accountId)`.
3. `assertCanManagePublicResource(actor)`.
4. Later: `assertCanRequestPublicShare(actor)`.

Policy:

1. Public resource upload, edit, delete, publish, and unpublish are admin-only for now.
2. Normal users may own private resources.
3. Normal users may request or mark intent to share resources publicly in the future, but that flow is not part of this refactor.
4. Routes may authenticate requests, but services must enforce authorization before mutating protected state.
5. Scheduler and background jobs must use explicit system actors or internal service methods, not bypass public authorization by accident.

Do not rely on frontend hiding buttons as an authorization control.

## Frontend And Tailwind Guardrails

This refactor should not alter UI. If a later task touches UI, follow these rules:

1. Preserve the current visual style unless the task explicitly asks for a visual redesign.
2. Use existing primitives from `@mina/ui/components/*`.
3. Keep Tailwind class names complete and statically detectable.
4. Prefer canonical utilities over arbitrary values:

```text
space-y-px instead of space-y-[1px]
mt-px instead of mt-[1px]
rounded-sm instead of rounded-[4px]
bg-linear-to-t instead of bg-gradient-to-t
border-(--color-canvas-selection-border)! instead of border-[color:var(--color-canvas-selection-border)]!
```

5. Avoid `backdrop-blur`, `filter: blur()`, `drop-shadow()`, `mix-blend-mode`, `mask-image`, and opacity/transform animations under the local performance policy.
6. Do not add decorative gradients, blur effects, or animation just to make structural work feel new.
7. For operational UI, prioritize dense, stable, scannable screens over marketing-style composition.
8. Follow usability basics: clear status, consistent controls, error prevention, and predictable navigation.

## Refactor Plan

### Phase 0: Baseline And Safety

Before code movement:

1. Run current API tests.
2. Run current API typecheck.
3. Run current API build.
4. Record route behavior covered by `apps/api/src/index.test.ts`.
5. Add missing route-level tests for tasks and workflows if coverage gaps block safe extraction.

Minimum commands:

```sh
bun --filter @mina/api test
bun --filter @mina/api typecheck
bun --filter @mina/api build
```

### Phase 1: Route And Contract Boundaries

1. Keep feature routes under `modules/*`.
2. Split `workflow-runs.routes.ts` from `workflows.routes.ts` if it reduces file coupling.
3. Keep `app/api-router.ts` as the route graph.
4. Add contracts subpath exports.
5. Update backend imports from broad `@mina/contracts` to module subpaths in touched files.
6. Run contracts typecheck and API build.

Do not change endpoint paths or response shapes in this phase.

### Phase 2: Tasks Decomposition

Extract in this order:

1. `providers/provider.ts`, `providers/registry.ts`, `providers/dev.provider.ts`.
2. `pricing.ts`.
3. `resources.ts`.
4. `retry.ts`.
5. `lifecycle.ts`.
6. Slim down `tasks.service.ts`.

Reason for this order:

1. Provider types are a stable boundary and easy to move first.
2. Pricing and resource helpers are mostly pure and easy to test.
3. Retry logic has environment coupling that should be made explicit.
4. Lifecycle extraction is riskier and should happen after pure helpers are covered.

Acceptance criteria:

1. `TasksService` public methods keep the same names and behavior.
2. No route code imports task lifecycle internals.
3. Provider adapters do not import repositories.
4. Retry calculations are unit-tested without mutating global env.
5. Task success, failure, cancellation, provider pending, polling retry, and start retry tests still pass.

### Phase 3: Workflows Decomposition

Extract in this order:

1. `workflow-runs.routes.ts` from `workflows.routes.ts`.
2. `media-selection.ts` and `task-config.ts` from `media.ts`.
3. `run-state.ts` from `execution.ts`.
4. `node-executor.ts` from `execution.ts`.
5. `run-executor.ts` as the remaining orchestration layer.
6. `workflow-runs.service.ts` for run use cases.
7. Keep or reduce `workflows.service.ts` to definition use cases.

Acceptance criteria:

1. Ordinary canvas isolated-node behavior is unchanged.
2. Flow-group DAG execution behavior is unchanged.
3. Required media errors and kind mismatch errors are unchanged.
4. Workflow run event records are still written.
5. Scheduler reconciliation still starts tasks, polls async tasks, and reconciles workflow runs in the same order.

### Phase 4: Authorization Skeleton

Add only the authorization skeleton needed for admin-first resource governance:

1. Actor model.
2. Policy functions.
3. Tests for admin and non-admin outcomes.
4. No user public-sharing workflow yet.

Acceptance criteria:

1. Admin can pass public resource management policy checks.
2. User cannot pass public resource upload/edit/delete policy checks.
3. Service-level checks exist for protected mutations.
4. Frontend-only checks are not treated as security.

### Phase 5: Boundary Tooling

This repository does not currently have ESLint configured. The first implemented guardrail is a lightweight Bun script:

```sh
bun run check:boundaries
```

It checks:

1. API code imports contracts through module subpath exports instead of the `@mina/contracts` root barrel.
2. Module services, domain files, and pure utilities do not import Hono.
3. Domain and pure utility files do not import env, database, provider, or vendor infrastructure.
4. Web code does not import `apps/api/src/*` implementation internals.

Recommended later additions when ESLint is introduced:

1. `import/no-cycle`.
2. `eslint-plugin-boundaries` or an equivalent import boundary rule.
3. A rule preventing route files from importing repository implementations directly.
4. A rule preventing provider adapters from importing route or workflow orchestration internals.

## File Size And Complexity Targets

These are guide rails, not hard laws:

```text
Route files:        30-150 lines
Public services:    100-250 lines
Pure utilities:     40-200 lines
Executors:          120-260 lines
Repositories:       100-350 lines
Contracts schemas:  80-260 lines
Tests:              any size that remains readable
```

When a file exceeds the target, split only if there is a clear responsibility boundary. Do not split files only to satisfy a number.

Good split reasons:

1. Different change triggers.
2. Different dependency needs.
3. Different test setup.
4. Reusable pure logic.
5. Different security or authorization boundary.

Bad split reasons:

1. One function per file.
2. Hiding complexity behind an index barrel.
3. Creating a folder that only contains pass-through re-exports.
4. Moving code without reducing dependencies.

## Testing Strategy

Required backend checks after each phase:

```sh
bun --filter @mina/api test
bun --filter @mina/api typecheck
```

Required after contracts exports or route typing changes:

```sh
bun --filter @mina/contracts typecheck
bun --filter @mina/api build
```

Required before merging the full refactor:

```sh
bun run check:boundaries
bun run check
```

Test coverage priorities:

1. Request-level route tests for every new or changed endpoint.
2. Unit tests for pure task pricing, retry, and resource mapping helpers.
3. Unit tests for workflow media selection and task config assembly.
4. Workflow integration tests for isolated node and flow-group execution.
5. Authorization tests for admin-only public resource actions when those actions are added.

## Migration Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Route path or response drift | Web client breaks | Keep route tests and do not change response DTOs during extraction |
| Hono RPC type drift | Type-safe client lies | Preserve `client.ts` or derive route type in a dedicated patch with build validation |
| Provider lifecycle regression | Tasks get stuck or double-run | Keep lifecycle tests around queued, running, pending, retry, terminal states |
| Workflow DAG regression | Flow groups execute incorrectly | Preserve current workflow tests and add focused tests before moving executor code |
| Event logging regression | Production debugging gets worse | Keep event log calls in acceptance tests for lifecycle paths |
| Repository mapping regression | PostgreSQL runtime differs from memory tests | Run repository-focused tests where possible and keep schema parsing at adapter edges |
| Over-abstracted modules | Code becomes harder to navigate | Split by responsibility only, avoid pass-through classes and barrels |
| Authorization bypass | Public resources can be changed by users | Enforce policy in service layer and default deny |

## Recommended Final Shape

After the staged refactor, the API should read like this:

```text
route: validate HTTP input and call one service method
service: enforce policy and coordinate use case
executor/lifecycle: perform state transitions
domain/util: provide pure facts and transformations
repository/provider: perform external side effects behind ports
contracts: define shared DTO schemas and inferred types
```

The most important rule is dependency clarity: each file should make its owner obvious from imports alone. If a pure helper imports `apiEnv`, Hono, a database client, or a vendor SDK, the boundary is wrong. If a route imports repository internals, the boundary is wrong. If an index barrel is needed to make tangled imports tolerable, the dependency direction should be fixed instead.

## Immediate Recommendation

Do the refactor in this sequence:

1. Add contracts subpath exports and route/client drift tests.
2. Split `tasks.provider.ts`, then extract task pricing/resources/retry helpers.
3. Extract task lifecycle after helper coverage is in place.
4. Split workflow run routes and workflow run service.
5. Extract workflow media selection, task config assembly, run state, node executor, and run executor.
6. Add admin-first authorization policies before implementing public resource management.
7. Add and run import boundary checks after the shape stabilizes.

This path improves structure without forcing a big-bang rewrite, and it keeps the current Hono module-local route design instead of replacing it with a less cohesive top-level routes folder.
