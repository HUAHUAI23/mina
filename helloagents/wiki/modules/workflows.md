# Workflows Module

## Purpose
Persist canvas workflows and execute selected nodes or flow groups using stable ordered media slot semantics.

## Specification
- Workflow definitions are stored in normalized `workflows`, `workflow_nodes`, and `workflow_edges` rows; public DTOs still expose React Flow-compatible `nodes` and `edges`.
- Workflow runs are stored in `workflow_runs` plus immutable `workflow_run_nodes` / `workflow_run_edges` snapshots, row-level `workflow_run_node_states`, and `workflow_run_node_dependencies`.
- `workflow_runs` uses `next_reconcile_at`, `lease_until`, `leased_by`, and `lease_token` for scheduler ownership. Running runs are claimed with PostgreSQL row locking semantics before reconciliation.
- Executable node data may store `mediaSlots`.
- `WorkflowMediaResolver` resolves media object, external URL, current MediaView, and workflow run output sources.
- Ordinary canvas runs execute only the selected node; upstream node output is read from `mediaView`.
- Flow-group runs derive dependencies from node-output media slot sources and read upstream output from the current workflow run state.
- Workflow node task creation uses task idempotency keys and a unique workflow-run/node task link to prevent duplicate task side effects.
- Media edge validation ensures node-output slot items and media edges remain consistent.

## Verification
- `apps/api/src/modules/workflows/workflows.service.test.ts`
- `apps/api/src/modules/workflows/workflow-helpers.test.ts`
- `apps/api/src/modules/workflows/repositories/drizzle-workflow-repositories.integration.test.ts` (requires `MINA_POSTGRES_TEST_DATABASE_URL`)
