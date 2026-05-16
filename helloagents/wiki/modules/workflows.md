# Workflows Module

## Purpose
Persist canvas workflows and execute selected nodes or flow groups using stable ordered media slot semantics.

## Specification
- Executable node data may store `mediaSlots`.
- `WorkflowMediaResolver` resolves media object, external URL, current MediaView, and workflow run output sources.
- Ordinary canvas runs execute only the selected node; upstream node output is read from `mediaView`.
- Flow-group runs derive dependencies from node-output media slot sources and read upstream output from the current workflow run state.
- Media edge validation ensures node-output slot items and media edges remain consistent.

## Verification
- `apps/api/src/modules/workflows/workflows.service.test.ts`
- `apps/api/src/modules/workflows/workflow-helpers.test.ts`
