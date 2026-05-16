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
  Media --> DB[(media_objects)]
```

## Key Decisions
| ID | Decision | Status | Modules |
| --- | --- | --- | --- |
| ADR-MEDIA-001 | Store file entities in `media_objects`; workflow/task records store references and snapshots. | Accepted | Media, Tasks, Workflows |
| ADR-WF-001 | Own media input order in target node `data.mediaSlots`, not in edge order. | Accepted | Workflows |
| ADR-TASK-001 | Mirror provider outputs through a shared `TaskOutputFinalizer`, not provider-specific storage code. | Accepted | Tasks, Media |

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
