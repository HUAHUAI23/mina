# Architecture

## Goals

This repository is structured for:

1. Clear application vs library boundaries
2. Stable package ownership
3. Shared runtime contracts between the API and the web app
4. Type-safe development with strict TypeScript defaults
5. Gradual backend evolution from in-memory repositories to real database adapters

## Top-Level Structure

```text
.
├── apps
│   ├── api
│   │   └── src
│   │       ├── app
│   │       ├── config
│   │       ├── lib
│   │       └── modules
│   └── web
│       └── src
│           ├── app
│           ├── config
│           ├── features
│           └── lib
├── docs
└── packages
    ├── contracts
    └── typescript-config
```

## Package Responsibilities

### `apps/api`

The Bun + Hono API application.

- `src/app/`: application composition and route graph
- `src/config/`: environment parsing
- `src/lib/`: shared HTTP primitives
- `src/modules/<feature>/`: route handlers, business services, repositories, and data sources

### `apps/web`

The Vite + React application.

- `src/app/`: providers, app shell, and shared app-level styling
- `src/config/`: client-safe environment parsing
- `src/features/<feature>/`: feature-specific API calls, hooks, and components
- `src/lib/`: reusable client-side utilities

### `packages/contracts`

Shared runtime schemas and inferred TypeScript types for the full stack.

- Request validation schemas
- Response validation schemas
- Shared DTOs and route data structures
- Task, pricing, workflow, and React Flow-compatible canvas contracts

### `packages/typescript-config`

Shared TypeScript baselines for the workspace.

- `base.json`: universal strict settings
- `bun.json`: Bun-oriented settings
- `react-app.json`: browser and React settings

## Backend Layering

The API follows this sequence:

```text
route -> service -> repository -> data source
```

### Route Layer

Owns HTTP-only concerns:

- Hono routing
- request validation
- status codes
- request/response conversion

### Service Layer

Owns business behavior:

- domain rules
- orchestration
- error semantics
- repository coordination

### Repository Layer

Owns persistence behavior:

- record lookup
- inserts
- deletes
- future database integration

### Data Layer

Owns static seed data or adapter bootstrapping.

## Task And Workflow Core

Mina now has backend contracts and API services for the generation workflow core:

- `tasks`: durable image/video generation task lifecycle, including sync image tasks, async video tasks, input/output resources, and task cancellation.
- `pricing`: model/resolution aware pricing estimates for token and duration billing.
- `workflows`: React Flow-compatible workflow definitions, media-slot edges, ordinary canvas node execution, flow-group DAG execution, node run states, and run cancellation.

The current runtime uses in-memory repositories so tests and local development do not require PostgreSQL. The Drizzle schema in `apps/api/src/db/schema.ts` is the PostgreSQL shape for the future persistent adapter and mirrors the contracts for tasks, resources, pricing rules, workflows, workflow runs, and workflow-node task links.

### Canvas Execution Semantics

Media edges always represent media-slot connections.

- On the ordinary canvas, running a selected node resolves required upstream media from the source node's persisted `mediaView`. Upstream nodes are not executed automatically.
- Inside a `flow_group`, edges are also execution dependencies. A flow run executes all roots in the group and downstream nodes resolve media from the current run's upstream outputs by resource kind, role, and index.
- `node_group` is visual only and does not affect execution.

React Flow compatibility rules:

- Persist `parentId`, not the old `parentNode` field.
- Persist only stable node/edge fields, not transient UI fields such as `selected`, `dragging`, or `measured`.
- Keep parent nodes before child nodes in the persisted `nodes` array.

## Frontend Layering

The web app follows this sequence:

```text
component -> hook -> feature api client -> shared http utility -> typed Hono client
```

This ensures that UI components do not depend on low-level transport details.

## API Contract Boundary

The web app does not import server implementation files. It only imports:

1. Shared schemas and types from `@mina/contracts`
2. The typed route surface from `@mina/api/client`

This keeps the client aligned with the API surface without coupling it to Bun-specific runtime code.

## Environment Strategy

- Server variables use regular environment names such as `MINA_API_PORT`.
- Client-safe values use the `VITE_` prefix so they can be accessed through `import.meta.env`.
- Secrets must never use the `VITE_` prefix.

## Testing Strategy

The API uses Bun tests against `app.request(...)`, which allows route-level behavior to be verified without starting a separate server process.

## Planned Next Step for Database Work

When a real database is introduced, the recommended upgrade path is:

1. Add a database adapter in `apps/api/src/modules/posts/`
2. Implement `PostRepository` with that adapter
3. Replace the in-memory repository in `src/app/dependencies.ts`
4. Keep routes, client contracts, and the React app unchanged
