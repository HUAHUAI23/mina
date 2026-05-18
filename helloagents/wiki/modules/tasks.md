# Tasks Module

## Purpose
Own generation task lifecycle, provider dispatch, resource snapshots, and output persistence.

## Specification
- `TasksService.createTask` validates model config, estimates pricing, persists input resources, and records creation events.
- `TaskLifecycle` starts/polls providers and finalizes successful provider outputs.
- `TaskOutputFinalizer` mirrors provider output URLs into managed media objects before success persistence.
- `OutputPostProcessor` adds video cover resources after finalization.
- `task_resources` input rows record slot and lineage details; output rows record media object links.

## Verification
- `apps/api/src/modules/tasks/tasks.service.test.ts`
- `apps/api/src/modules/tasks/output/task-output-finalizer.test.ts`
- `apps/api/src/modules/tasks/output/output-post-processor.test.ts`
- Provider mapper/spec tests under `apps/api/src/modules/tasks/providers/`
