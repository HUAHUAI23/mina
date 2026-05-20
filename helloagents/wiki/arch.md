# Architecture

## System Shape
```mermaid
flowchart TD
  Web[apps/web] --> Contracts[packages/contracts]
  Web --> ApiClient["@mina/api/client"]
  Api[apps/api] --> Contracts
  Api --> Tasks[TasksService]
  Api --> Workflows[WorkflowsService]
  Tasks --> Providers[ProviderRouter / ModelSpec]
  Tasks --> Media[MediaObjectService]
  Workflows --> Resolver[WorkflowMediaResolver]
  Resolver --> Media
  Resolver --> Tasks
  Media --> Storage[ObjectStorage]
  Api --> DB[(PostgreSQL)]
  Media --> DB
```

## Key Decisions
| ID | Decision | Status | Modules |
| --- | --- | --- | --- |
| ADR-MEDIA-001 | Store file entities in `media_objects`; workflow/task records store references and snapshots. | Accepted | Media, Tasks, Workflows |
| ADR-WF-001 | Own media input order in target node `data.mediaSlots`, not in edge order. | Accepted | Workflows |
| ADR-TASK-001 | Mirror provider outputs through a shared `TaskOutputFinalizer`, not provider-specific storage code. | Accepted | Tasks, Media |
| ADR-DATA-001 | Use PostgreSQL-backed Drizzle repositories for application business runtime; keep fakes only in tests. | Accepted | API |
| ADR-WEB-001 | Keep the browser-sized app shell in the TanStack root layout; route pages render only inside the stable route frame. | Accepted | Web |
| ADR-WEB-002 | Gate unauthenticated browser usage at the app provider layer with a centered password login/register card, typed Hono RPC calls, and contract-parsed responses. | Accepted | Web, Auth |
| ADR-WF-002 | Split workflow canvas render state from persisted document projection; React Flow interaction frames update render state while graph commits write Yjs. | Accepted | Web, Workflows |
| ADR-WF-003 | Use Yjs as the workflow canvas graph single source of truth; REST workflow definitions are read models. | Accepted | Web, API, Workflows |
| ADR-WF-004 | Collaboration checkpoints perform server-side Yjs compaction and read-model refresh only; clients do not upload full graph state. | Accepted | Web, API, Workflows |

## Runtime Flow
```mermaid
sequenceDiagram
  participant Workflow
  participant Resolver as WorkflowMediaResolver
  participant Tasks as TasksService
  participant Provider
  participant Finalizer as TaskOutputFinalizer
  participant Media as MediaObjectService

  Workflow->>Resolver: resolve node mediaSlots
  Resolver->>Media: read ready media_objects
  Resolver->>Tasks: read upstream task output when needed
  Workflow->>Tasks: create queued task with TaskConfig.media
  Tasks->>Provider: start/poll
  Provider-->>Tasks: NodeExecutionOutput
  Tasks->>Finalizer: finalize output resources
  Finalizer->>Media: create output media_objects
  Tasks-->>Workflow: task output with mediaObjectId
```

## Workflow Canvas State Flow
```mermaid
flowchart TD
  RF[React Flow] --> RS[Render Store: flowNodes / flowEdges]
  RF --> PS[Presence Store: cursor / selection / dragging / viewport]
  RS --> DC[Drag Stop Diff]
  DC --> CMD[Yjs Command Layer]
  UI[Composer / Media Slots / Toolbar] --> CMD
  CMD --> YJS[Client Yjs Document]
  YJS --> PROJ[Zustand Projection: nodes / edges]
  PROJ --> RS
  YJS <--> YWS[Authenticated y-websocket Room]
  YWS --> YPERSIST[Yjs Updates / Snapshots]
  YWS --> READ[Workflow Definition Read Model]
  READ --> RUN[Workflow Run Snapshot]
```

## Workflow Collaboration Flow
```mermaid
sequenceDiagram
  participant ClientA
  participant API as Hono/Bun API
  participant Room as WorkflowYjsRoomService
  participant Store as WorkflowYjsRepository
  participant ClientB

  ClientA->>API: WS /api/workflows/:id/collab/:id?token=...
  API->>API: authenticate and authorize workflow access
  API->>Room: connect workflow room
  Room->>Store: load snapshot and updates
  Room-->>ClientA: y-websocket sync step
  ClientA->>Room: Yjs update
  Room->>Store: append update
  Room->>Room: apply update to server ydoc
  Room-->>ClientB: broadcast Yjs update
  ClientA->>Room: awareness update
  Room-->>ClientB: broadcast awareness
  ClientA->>API: POST /collab/checkpoint { name? }
  API->>Room: validate graph, compact server ydoc, return state vector, refresh read model
```
