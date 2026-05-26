# Workflow Yjs Storage Invariants

During active development the workflow canvas Y.Doc format is treated as a source-level invariant, not a repair target.

## Rules

1. `y.nodes` entries must be nested `Y.Map` values. Do not write plain workflow node objects with `y.nodes.set(id, plainObject)`.
2. All node writes must go through `writeWorkflowNode`. This is the only function allowed to create or replace a node map.
3. `writeWorkflowNode` must unconditionally write identity fields: `id`, `type`, `data.nodeType`, and `data.title`. These fields must not use `previous !== next` conditional patching.
4. Text CRDT fields (`prompt`, `text`) must keep their `Y.Text` instances and update by replacing text content in place. Other fields can use blind `Y.Map.set` writes.
5. `readWorkflowNodeFromYjs` must fail loud for corrupt nested node maps outside production. Missing identity/data fields are programming errors.
6. `validateWorkflowCanvasGraph` is an invariant detector, not a data-cleaning tool. Do not sanitize orphan edges before validation to hide write-path bugs.

Legacy full-node JSON entries may still be read for old persisted updates, but the first write through `writeWorkflowNode` must migrate that entry into the nested map shape.
