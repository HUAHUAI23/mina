# 06 - Workflow Canvas Undo and Redo

This document defines the implementation guidance for undo/redo on the
workflow canvas. It is written as a follow-up to the collaboration design
records `01` through `05`, and it assumes the current Yjs-first canvas
architecture under `apps/web/src/features/workflow-canvas`.

The short version: undo/redo must be implemented with `Y.UndoManager`, not
with React Flow snapshot history. The workflow canvas document is a Yjs
document; the Zustand canvas store is only a projection of that document.
Undoing a canvas edit must therefore produce another Yjs operation and flow
through the same projection, persistence, and broadcast paths as any other
edit.

This document intentionally corrects three points that are easy to get
wrong:

- `ignoreRemoteMapChanges` must stay at the Yjs default of `false`; setting
  it to `true` enables overwriting newer remote map edits.
- `useSyncExternalStore` snapshots must be referentially stable when
  `canUndo` and `canRedo` have not changed.
- Discrete structural commands should call `stopCapturing()` both before
  and after the Yjs transaction, so they do not merge with nearby text
  capture windows or following structural edits.

## Decision

Use one `Y.UndoManager` per mounted workflow Yjs runtime.

The UndoManager should:

- Track only local user edit transactions whose origin is `'mina-local'`.
- Scope only collaborative canvas document types:
  `nodes`, `nodeFrames`, `nodeOrder`, `edges`, and `edgeOrder`.
- Exclude non-document or runtime-only state such as `meta`, React Flow
  local render state, selection state, runtime facts, query caches, task
  status, and local media playback state.
- Keep Yjs' default remote-map conflict protection. Do not set
  `ignoreRemoteMapChanges: true`.
- Reuse the existing ydoc -> store projection path. Undo and redo must not
  add a new sync channel, a new server endpoint, or a parallel document
  snapshot stack.

The UndoManager lives with the runtime registered by
`registerWorkflowYjsRuntime(workflowId, y, snapshot)`. It is destroyed by
`unregisterWorkflowYjsRuntime(workflowId, y)`.

## Why not React Flow snapshot history

React Flow's undo/redo example uses a local history stack of whole graph
snapshots. That approach is appropriate for a single-user React Flow app,
but it is the wrong primitive for this canvas because the graph is not owned
by React Flow state.

The current collaboration model has these invariants:

- The Yjs document is the single source of truth.
- Zustand is a one-way UI projection of the ydoc.
- Local user actions write to ydoc exactly once.
- The server validates, persists, applies, and broadcasts raw Yjs updates.
- The sender is excluded from server broadcasts.

A React Flow snapshot stack violates that model in two ways:

1. It creates a second source of truth for historical graph state in the
   client.
2. Undoing by replaying a whole `nodes`/`edges` snapshot is a
   read-derive-write loop: read the projected graph, derive a historical
   full graph, then write the whole graph back.

That is the same class of operation that the collaboration refactor removed.
It can overwrite concurrent edits from peers, reintroduce empty-canvas
flicker windows, and turn a narrow user intent into a large full-graph
operation.

Undo and redo must be ordinary Yjs transactions instead.

## Current code fit

The project already has most of the necessary shape.

### Runtime lifecycle

`useWorkflowYjsSync(workflowId)` creates a new `WorkflowYDocHandles` object
with `createWorkflowYDoc()`, then registers it in `workflow-yjs-store.ts`
after the REST-hydrated store is available.

Relevant files:

- `apps/web/src/features/workflow-canvas/sync/yjs/yjs-sync.ts`
- `apps/web/src/features/workflow-canvas/sync/yjs/workflow-yjs-store.ts`
- `apps/web/src/features/workflow-canvas/sync/yjs/yjs-document.ts`

The runtime currently stores:

```ts
interface WorkflowYjsRuntimeState {
  edges: WorkflowCanvasEdge[]
  nodes: WorkflowCanvasNode[]
  providerStatus: 'connected' | 'connecting' | 'disconnected'
  synced: boolean
  workflowId: string
  y: WorkflowYDocHandles
  snapshotSignature: string
}
```

UndoManager belongs here, because it has the same lifetime and the same
workflow isolation boundary as the ydoc.

### Collaborative document shape

The current ydoc contains these top-level shared types:

```ts
interface WorkflowYDocHandles {
  edgeOrder: Y.Array<string>
  edges: Y.Map<unknown>
  meta: Y.Map<unknown>
  nodeFrames: Y.Map<unknown>
  nodeOrder: Y.Array<string>
  nodes: Y.Map<unknown>
  ydoc: Y.Doc
}
```

Nodes are not stored as opaque JSON blobs anymore. `writeWorkflowNode(...)`
stores each node as a nested `Y.Map`, and text-like fields such as text node
content and generation prompts are stored as `Y.Text`.

That is important because an UndoManager scoped to `y.nodes` will also track
changes in nested node maps and text objects. There is no need to scope each
child type separately.

### Command boundary

Most graph and configuration edits already pass through
`workflowYjsCommands.*`, and those commands commit one Yjs transaction with
origin `'mina-local'`.

Examples:

- `addMediaConnection(...)`
- `addNode(...)`
- `addMediaGenerationNode(...)`
- `removeGraphEdges(...)`
- `removeGraphNodes(...)`
- `addSlotItem(...)`
- `removeSlotItem(...)`
- `replaceSlotItemMediaObject(...)`
- `setNodeTaskConfig(...)`
- `setNodeText(...)`

This is exactly the boundary UndoManager needs: a single user action maps to
a single Yjs transaction, and therefore to a single undo stack item unless
capturing intentionally merges nearby edits.

One important exception is the helper split between `withYDoc(...)` and
`withNodeFrameYDoc(...)`. Drag and frame commits use `withNodeFrameYDoc`.
Any capture-boundary work must update both helpers.

## UndoManager configuration

Use this configuration:

```ts
const undo = new Y.UndoManager(
  [y.nodes, y.nodeFrames, y.nodeOrder, y.edges, y.edgeOrder],
  {
    trackedOrigins: new Set(['mina-local']),
    captureTimeout: 500,
  },
)
```

Do not include `y.meta` in the scope.

Do not set `ignoreRemoteMapChanges: true`.

### Why `trackedOrigins` is required

The command layer already writes local user edits with origin
`'mina-local'`:

```ts
runtime.y.ydoc.transact(() => apply(runtime.y, runtime.workflowId), 'mina-local')
```

`trackedOrigins: new Set(['mina-local'])` means:

- Local user edits enter the undo stack.
- Initial imports and bootstrap work do not enter the undo stack.
- Remote provider updates do not enter the undo stack.
- Runtime/event-stream projections do not enter the undo stack.

Yjs automatically adds the UndoManager instance itself to `trackedOrigins`,
so redo operations are captured correctly.

### Why `ignoreRemoteMapChanges` must stay false

This option is easy to misread. In Yjs 13.6.30, the source comment says:

> By default, the UndoManager will never overwrite remote changes. Enable
> this property to enable overwriting remote changes on key-value changes.

The default is the behavior we want.

For map fields such as node position, width, height, task model, provider,
params, or media view:

1. User A changes a field locally.
2. User B changes the same field remotely.
3. User A presses undo.

With default `ignoreRemoteMapChanges: false`, A's undo will not overwrite
B's newer map value.

With `ignoreRemoteMapChanges: true`, A's undo may restore the older value
and overwrite B's edit. That violates the collaborative undo semantics this
feature needs.

Therefore the implementation must omit `ignoreRemoteMapChanges` or set it
explicitly to `false`.

## Runtime store changes

Extend `WorkflowYjsRuntimeState`:

```ts
interface WorkflowYjsRuntimeState {
  edges: WorkflowCanvasEdge[]
  nodes: WorkflowCanvasNode[]
  providerStatus: 'connected' | 'connecting' | 'disconnected'
  synced: boolean
  workflowId: string
  y: WorkflowYDocHandles
  undo: Y.UndoManager
  snapshotSignature: string
}
```

Create and destroy the UndoManager with the runtime:

```ts
export const registerWorkflowYjsRuntime = (
  workflowId: string,
  y: WorkflowYDocHandles,
  snapshot: WorkflowYjsSnapshotRefs,
): void => {
  const undo = new Y.UndoManager(
    [y.nodes, y.nodeFrames, y.nodeOrder, y.edges, y.edgeOrder],
    {
      trackedOrigins: new Set(['mina-local']),
      captureTimeout: 500,
    },
  )

  runtimes.set(workflowId, {
    edges: snapshot.edges,
    nodes: snapshot.nodes,
    providerStatus: 'connecting',
    snapshotSignature: workflowYjsSnapshotSignature(snapshot),
    synced: false,
    undo,
    workflowId,
    y,
  })

  emitWorkflowYjsRuntimeChange(workflowId)
}

export const unregisterWorkflowYjsRuntime = (
  workflowId: string,
  y: WorkflowYDocHandles,
): void => {
  const runtime = runtimes.get(workflowId)
  if (runtime?.y !== y) {
    return
  }
  runtime.undo.destroy()
  runtimes.delete(workflowId)
  emitWorkflowYjsRuntimeChange(workflowId)
}
```

The runtime store should expose a subscription for runtime availability
changes:

```ts
type WorkflowYjsRuntimeListener = () => void

const runtimeListeners = new Map<string, Set<WorkflowYjsRuntimeListener>>()

export const subscribeWorkflowYjsRuntime = (
  workflowId: string,
  listener: WorkflowYjsRuntimeListener,
): (() => void) => {
  const listeners = runtimeListeners.get(workflowId) ?? new Set()
  listeners.add(listener)
  runtimeListeners.set(workflowId, listeners)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      runtimeListeners.delete(workflowId)
    }
  }
}

const emitWorkflowYjsRuntimeChange = (workflowId: string): void => {
  runtimeListeners.get(workflowId)?.forEach((listener) => listener())
}
```

This matters because React components can mount before the Yjs runtime has
been registered. A hook that only checks the runtime once may subscribe to
nothing and never become active after registration.

## Undo command layer

Add a thin command module:

```ts
// apps/web/src/features/workflow-canvas/sync/yjs/workflow-undo-commands.ts
import { getWorkflowYjsRuntimeForWorkflow } from './workflow-yjs-store'

export const workflowUndoCommands = {
  undo(workflowId: string): void {
    getWorkflowYjsRuntimeForWorkflow(workflowId)?.undo.undo()
  },

  redo(workflowId: string): void {
    getWorkflowYjsRuntimeForWorkflow(workflowId)?.undo.redo()
  },

  canUndo(workflowId: string): boolean {
    return getWorkflowYjsRuntimeForWorkflow(workflowId)?.undo.canUndo() ?? false
  },

  canRedo(workflowId: string): boolean {
    return getWorkflowYjsRuntimeForWorkflow(workflowId)?.undo.canRedo() ?? false
  },

  stopCapturing(workflowId: string): void {
    getWorkflowYjsRuntimeForWorkflow(workflowId)?.undo.stopCapturing()
  },

  clear(workflowId: string): void {
    getWorkflowYjsRuntimeForWorkflow(workflowId)?.undo.clear()
  },
}
```

UI and Zustand actions should call this command module. They should not
touch `Y.UndoManager` directly.

## Store actions

Add undo/redo actions to the canvas store types:

```ts
interface CanvasGraphActions {
  addMediaConnection(input: MediaConnectionInput): void
  addMediaGenerationNode(input: { ... }): string
  addNode(type: WorkflowNodeType, task?: TaskDraftConfig | undefined): string
  commitNodeFrames(input: readonly CanvasNodeFramePatch[]): void
  redo(): void
  removeGraphEdges(edgeIds: readonly string[]): void
  removeGraphNodes(nodeIds: readonly string[]): void
  setNodeFrame(input: CanvasNodeFramePatch): void
  undo(): void
}
```

Wire them in `graph-slice.ts`:

```ts
undo: () => workflowUndoCommands.undo(get().workflowId),
redo: () => workflowUndoCommands.redo(get().workflowId),
```

Keeping undo/redo on the canvas store preserves the existing UI pattern:
components call store actions, and store actions delegate to command modules.

## Reactive undo state

Add a hook that uses `useSyncExternalStore`.

It must subscribe to both:

- runtime registration/unregistration events from `workflow-yjs-store.ts`
- UndoManager stack events when a runtime is available

Use these UndoManager events:

- `stack-item-added`
- `stack-item-updated`
- `stack-item-popped`
- `stack-cleared`

`stack-item-updated` is required because Yjs merges changes within the
capture timeout and emits an update event instead of an add event.

The snapshot reader must return the same object reference when the values
have not changed. React uses this identity to decide whether the external
snapshot is stable; returning a fresh `{ canUndo, canRedo }` object on every
read can trigger repeated renders or a maximum-update-depth failure.

This referential cache is not a second source of truth. It only preserves
React snapshot identity. The boolean values are still read directly from the
UndoManager.

Example:

```ts
// apps/web/src/features/workflow-canvas/sync/yjs/use-workflow-undo-state.ts
import { useSyncExternalStore } from 'react'
import {
  getWorkflowYjsRuntimeForWorkflow,
  subscribeWorkflowYjsRuntime,
} from './workflow-yjs-store'

export interface WorkflowUndoState {
  canRedo: boolean
  canUndo: boolean
}

const emptyUndoState: WorkflowUndoState = {
  canRedo: false,
  canUndo: false,
}

const undoStateCache = new Map<string, WorkflowUndoState>()

const readUndoState = (workflowId: string): WorkflowUndoState => {
  const undo = getWorkflowYjsRuntimeForWorkflow(workflowId)?.undo
  if (!undo) {
    undoStateCache.delete(workflowId)
    return emptyUndoState
  }

  const next: WorkflowUndoState = {
    canRedo: undo.canRedo(),
    canUndo: undo.canUndo(),
  }
  const previous = undoStateCache.get(workflowId)
  if (
    previous &&
    previous.canRedo === next.canRedo &&
    previous.canUndo === next.canUndo
  ) {
    return previous
  }
  undoStateCache.set(workflowId, next)
  return next
}

export function useWorkflowUndoState(workflowId: string): WorkflowUndoState {
  return useSyncExternalStore(
    (onChange) => {
      const unsubscribeRuntime = subscribeWorkflowYjsRuntime(workflowId, onChange)
      const undo = getWorkflowYjsRuntimeForWorkflow(workflowId)?.undo

      if (!undo) {
        return unsubscribeRuntime
      }

      undo.on('stack-item-added', onChange)
      undo.on('stack-item-updated', onChange)
      undo.on('stack-item-popped', onChange)
      undo.on('stack-cleared', onChange)

      return () => {
        unsubscribeRuntime()
        undo.off('stack-item-added', onChange)
        undo.off('stack-item-updated', onChange)
        undo.off('stack-item-popped', onChange)
        undo.off('stack-cleared', onChange)
      }
    },
    () => readUndoState(workflowId),
    () => emptyUndoState,
  )
}
```

This hook must not maintain a parallel history stack or independently
decide whether undo is possible. It may only cache the last derived snapshot
object for React identity stability.

## Capture boundaries

Yjs merges transactions into one undo stack item when they happen within
`captureTimeout`. The default is 500ms. That is useful for text editing but
bad for structural graph operations.

The intended user semantics:

- Continuous text typing should usually undo as one step.
- A drag commit should undo as one step.
- Deleting a node should undo as one step.
- Deleting two different nodes through two distinct user actions should be
  two undo steps, even if the user acts quickly.
- Dragging a node and immediately deleting an edge should not merge into
  one undo step.

Update both transaction helpers. Call `stopCapturing()` before and after
discrete transactions:

- The pre-transaction call prevents a structural operation from being
  appended to a previous prompt/text capture item that is still inside the
  500ms capture timeout.
- The post-transaction call prevents the next operation from being appended
  to this structural operation.

```ts
interface WorkflowYjsCaptureOptions {
  discrete?: boolean | undefined
}

const withYDoc = (
  context: WorkflowYjsCommandContext,
  apply: (y: WorkflowYDocHandles, workflowId: string) => void,
  options: WorkflowYjsCaptureOptions = {},
): void => {
  const runtime = getWorkflowYjsRuntimeForWorkflow(context.workflowId)
  if (!runtime) {
    throw new Error(`Yjs runtime not registered for workflow ${context.workflowId}`)
  }

  const discrete = options.discrete ?? true
  if (discrete) {
    runtime.undo.stopCapturing()
  }

  runtime.y.ydoc.transact(() => apply(runtime.y, runtime.workflowId), 'mina-local')

  if (discrete) {
    runtime.undo.stopCapturing()
  }

  if (!import.meta.env.PROD) {
    const snapshot = exportWorkflowSnapshotFromYjs(runtime.y)
    validateWorkflowCanvasGraph(snapshot.nodes, snapshot.edges)
  }
}
```

And for frame commits:

```ts
const withNodeFrameYDoc = (
  context: WorkflowYjsCommandContext,
  mutate: (y: WorkflowYDocHandles, workflowId: string) => void,
  options: WorkflowYjsCaptureOptions = {},
): void => {
  const runtime = getWorkflowYjsRuntimeForWorkflow(context.workflowId)
  if (!runtime) {
    return
  }

  const discrete = options.discrete ?? true
  if (discrete) {
    runtime.undo.stopCapturing()
  }

  runtime.y.ydoc.transact(() => mutate(runtime.y, runtime.workflowId), 'mina-local')

  if (discrete) {
    runtime.undo.stopCapturing()
  }
}
```

Be careful with text commands:

- `setNodeText(...)` must update only the text node's nested `Y.Text` value
  and can use `{ discrete: false }`.
- `setNodeTaskConfig(...)` is not necessarily pure text. It may update
  prompt, model, provider, params, and compatibility-derived fields. Do not
  blindly mark the whole command as non-discrete unless the call site is
  known to be a prompt-only edit.
- Prompt typing must use a dedicated `setNodeTaskPrompt(...)` command. That
  command must update only the task prompt's nested `Y.Text` value and use
  `{ discrete: false }`.

The document layer should expose narrow write helpers for these two cases,
for example `writeWorkflowTextNodeText(...)` and
`writeWorkflowNodeTaskPrompt(...)`. Avoid routing prompt typing through
`writeWorkflowNode(...)`, because that rewrites the full node map and can
pull unrelated task fields into the text capture window.

This split avoids merging model changes, params changes, media slot
compatibility changes, and prompt typing into one undo step.

## UI controls

Use React Flow's existing `Controls` panel. It already exists in
`WorkflowCanvas.tsx`:

```tsx
<Controls className="mina-wc-controls" position="bottom-right" showInteractive={false} />
```

Import `ControlButton`, `Undo2`, and `Redo2`:

```tsx
import { ControlButton, Controls } from '@xyflow/react'
import { Redo2, Undo2 } from 'lucide-react'
```

Add the undo state hook and store actions:

```tsx
const workflowId = useCanvasStore((state) => state.workflowId)
const undo = useCanvasStore((state) => state.undo)
const redo = useCanvasStore((state) => state.redo)
const undoState = useWorkflowUndoState(workflowId)
```

Render:

```tsx
<Controls className="mina-wc-controls" position="bottom-right" showInteractive={false}>
  <ControlButton
    aria-label={m.workflow_canvas_undo()}
    disabled={!undoState.canUndo}
    onClick={undo}
    title={m.workflow_canvas_undo()}
  >
    <Undo2 aria-hidden="true" size={14} />
  </ControlButton>
  <ControlButton
    aria-label={m.workflow_canvas_redo()}
    disabled={!undoState.canRedo}
    onClick={redo}
    title={m.workflow_canvas_redo()}
  >
    <Redo2 aria-hidden="true" size={14} />
  </ControlButton>
</Controls>
```

Update the CSS for disabled control buttons. The current
`.mina-wc-controls.react-flow__controls button` rules style normal and hover
states but do not define a disabled state.

Add something like:

```css
.mina-wc-controls.react-flow__controls button:disabled {
  color: var(--foreground-quaternary);
  cursor: not-allowed;
  opacity: 0.45;
}

.mina-wc-controls.react-flow__controls button:disabled:hover {
  background: transparent;
  color: var(--foreground-quaternary);
}
```

## Keyboard shortcuts

Add a hook under `react-flow/`:

```ts
// apps/web/src/features/workflow-canvas/react-flow/use-workflow-undo-shortcuts.ts
import { useEffect } from 'react'
import { useCanvasStore } from '../store/canvas-store'
import { isIgnoredCanvasTarget } from '../utils/canvas-dom-scope'

export function useWorkflowUndoShortcuts(): void {
  const undo = useCanvasStore((state) => state.undo)
  const redo = useCanvasStore((state) => state.redo)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) {
        return
      }

      const key = event.key.toLowerCase()
      const isUndo = key === 'z' && !event.shiftKey
      const isRedo = (key === 'z' && event.shiftKey) || (event.ctrlKey && key === 'y')

      if (!isUndo && !isRedo) {
        return
      }

      if (isIgnoredCanvasTarget(event.target)) {
        return
      }

      event.preventDefault()
      if (isRedo) {
        redo()
      } else {
        undo()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [redo, undo])
}
```

Call it from `WorkflowCanvas`.

The `isIgnoredCanvasTarget(...)` guard is mandatory. Text inputs,
textareas, buttons, selects, contenteditable regions, React Flow controls,
and minimap interactions should keep their native or component-specific
keyboard behavior.

## Internationalization

Add semantic message keys to:

- `packages/i18n/messages/en.json`
- `packages/i18n/messages/zh-Hans.json`

Suggested English:

```json
"workflow_canvas_undo": "Undo",
"workflow_canvas_redo": "Redo"
```

For Simplified Chinese, add the equivalent localized translations for
`Undo` and `Redo` in `zh-Hans.json`. Do not leave the English fallback in
that locale file.

Then run:

```sh
bun run i18n:compile
```

Do not hard-code UI strings in `WorkflowCanvas.tsx`.

## Collaboration semantics

### Local-only undo stack

Each browser tab owns its own UndoManager instance. It tracks only the local
user's `'mina-local'` transactions.

If A and B edit the same workflow:

- A's undo stack contains A's local user edits.
- B's undo stack contains B's local user edits.
- A pressing undo does not pop B's undo stack.
- B pressing undo does not pop A's undo stack.

The inverse operation produced by undo is still a normal Yjs update, so peers
see the document change. What remains local is the stack ownership.

### Remote map conflict protection

For Y.Map fields, default UndoManager behavior prevents local undo from
overwriting newer remote values.

Example:

1. A moves node `n1` from `{x: 0, y: 0}` to `{x: 100, y: 100}`.
2. B moves `n1` to `{x: 200, y: 200}`.
3. A presses undo.

Expected result: B's `{x: 200, y: 200}` remains.

That expected result depends on leaving `ignoreRemoteMapChanges` false.

### Structural atomicity

Commands such as `removeGraphNodes(...)` already combine related structural
changes in one transaction:

- delete selected nodes
- delete incident edges
- clean affected media slots
- update compatibility-derived task model fields

Undoing that transaction restores the document at the same atomic boundary.
This avoids suspended edges and partially-restored media slots.

### Offline and reconnect

Undo and redo operations are Yjs updates. They use the same y-websocket sync
protocol as all other document edits.

No special server behavior is required for:

- offline local undo
- reconnect replay
- receiving another peer's undo
- checkpoint compaction after undo

The collaboration server should continue treating undo updates like ordinary
updates: validate, persist, apply, and broadcast excluding the sender.

## Selection restoration

Selection is local UI state, not collaborative document state. It should not
be part of the UndoManager scope.

Restoring selection after undo/redo is useful, but optional. If implemented,
use `StackItem.meta`, not ydoc fields.

Yjs stack items expose a metadata map:

```ts
undo.on('stack-item-added', ({ stackItem }) => {
  stackItem.meta.set('selectedNodeIds', useCanvasUiStore.getState().selectedNodeIds)
})

undo.on('stack-item-popped', ({ stackItem }) => {
  const selectedNodeIds = stackItem.meta.get('selectedNodeIds')
  if (Array.isArray(selectedNodeIds)) {
    selectWorkflowCanvasNodes(selectedNodeIds)
  }
})
```

Treat this as a second pass. The first implementation should prioritize
correct document semantics, stack state, controls, shortcuts, and tests.

## Diagnostics

UndoManager-generated undo/redo updates use the UndoManager instance as the
transaction origin. The current Yjs update diagnostics in `yjs-sync.ts`
count only `'mina-local'` and `'mina-bootstrap'` as local:

```ts
const isLocal = origin === 'mina-local' || origin === 'mina-bootstrap'
```

UndoManager-generated updates should be counted as local diagnostics too:

```ts
const runtime = getWorkflowYjsRuntimeForWorkflow(workflowId)
const isLocal =
  origin === 'mina-local' ||
  origin === 'mina-bootstrap' ||
  origin === runtime?.undo
```

This is not required for document correctness, but it keeps performance and
sync counters truthful during undo/redo testing.

## Tests

Add focused tests near the existing Yjs command tests:

- `apps/web/src/features/workflow-canvas/sync/yjs/workflow-undo-commands.spec.ts`
- or extend `workflow-yjs-commands.spec.ts` if the test stays compact.

Required cases:

1. **Tracks only local origin**
   - Create ydoc and register runtime.
   - Apply a transaction with origin `'remote-test'`.
   - Assert `canUndo() === false`.
   - Apply a command transaction with origin `'mina-local'`.
   - Assert `canUndo() === true`.

2. **Undo/redo add node**
   - Add a node through `workflowYjsCommands`.
   - Undo.
   - Assert node is absent.
   - Redo.
   - Assert node is present again.

3. **Undo/redo add edge**
   - Add a media connection.
   - Undo.
   - Assert edge and slot item changes are reverted.
   - Redo.
   - Assert edge and slot item changes return.

4. **Atomic node deletion**
   - Start with two connected nodes.
   - Remove one node.
   - Assert node and edge are removed and target slot cleanup happened.
   - Undo.
   - Assert node, edge, and slot state are restored together.

5. **Remote map conflict protection**
   - Use two Y.Docs to simulate A and B.
   - A local transaction changes a map field, tracked by UndoManager.
   - Sync A to B.
   - B changes the same map field.
   - Sync B back to A.
   - A undo.
   - Assert B's value remains.
   - This test must use default `ignoreRemoteMapChanges: false`.

6. **Capture boundary for structure**
   - Perform two structural commands quickly.
   - Assert the first undo reverts only the second command.
   - Assert the second undo reverts the first command.

7. **Text capture merge**
   - Perform multiple pure text updates with `{ discrete: false }`.
   - Assert one undo reverts the grouped text changes.
   - Cover both `setNodeText(...)` and `setNodeTaskPrompt(...)`.
   - Assert prompt undo restores the previous prompt without changing task
     kind, provider, model, or params.

8. **Runtime cleanup**
   - Register runtime and capture an undo stack item.
   - Unregister runtime.
   - Assert no runtime remains and no stack event subscriptions are leaked.

For UI behavior, add Playwright coverage only after the core command tests
pass:

- Undo and redo buttons enable after a graph edit.
- Buttons disable at stack boundaries.
- `Meta+Z` / `Ctrl+Z` works on the canvas.
- Textarea-native undo is not intercepted while editing a prompt.

## Implementation order

Implement in this order:

1. Add `undo` to `WorkflowYjsRuntimeState`.
2. Add runtime availability subscription to `workflow-yjs-store.ts`.
3. Create and destroy UndoManager in register/unregister.
4. Add `workflow-undo-commands.ts`.
5. Add store `undo()` and `redo()` actions.
6. Add `use-workflow-undo-state.ts`.
7. Add capture-boundary options to `withYDoc(...)` and `withNodeFrameYDoc(...)`.
8. Mark only pure text updates as non-discrete.
9. Add keyboard shortcut hook.
10. Add React Flow control buttons.
11. Add CSS disabled state.
12. Add i18n keys and run `bun run i18n:compile`.
13. Add Yjs command/unit tests.
14. Add focused Playwright coverage if the UI behavior is not already
    covered by manual QA.
15. Run validation:
    - `bun --filter @mina/web typecheck`
    - targeted Bun specs for workflow canvas Yjs
    - relevant Playwright workflow canvas tests if UI controls changed

## Implementation status

The current implementation follows this design:

- `WorkflowYjsRuntimeState` owns one `Y.UndoManager` per mounted workflow
  runtime.
- The UndoManager scopes `nodes`, `nodeFrames`, `nodeOrder`, `edges`, and
  `edgeOrder`; it does not scope `meta`.
- Local user commands use origin `'mina-local'`; remote/provider updates and
  imports stay out of the local undo stack.
- Structural commands are discrete and call `stopCapturing()` before and
  after their transaction.
- `setNodeText(...)` and `setNodeTaskPrompt(...)` are non-discrete and use
  narrow nested `Y.Text` writes.
- React Flow controls and keyboard shortcuts are wired through store actions
  and do not access Yjs directly.
- `useWorkflowUndoState(...)` derives `canUndo`/`canRedo` from UndoManager
  events, rebinds when the runtime is registered or replaced, and keeps
  snapshot object identity stable for React.
- Yjs diagnostics classify UndoManager-origin updates as local updates.
- The minimap and controls have explicit stacking rules so the undo/redo
  buttons remain clickable.

Validation commands run for this implementation:

```sh
bun run i18n:compile
bun --filter @mina/web typecheck
bun apps/web/src/features/workflow-canvas/sync/yjs/workflow-undo-commands.spec.ts
bun apps/web/src/features/workflow-canvas/sync/yjs/workflow-yjs-commands.spec.ts
bun apps/web/src/features/workflow-canvas/sync/yjs/yjs-document.spec.ts
find apps/web/src/features/workflow-canvas -name '*.spec.ts' -print | sort | xargs -n 1 bun
bunx playwright test tests/workflow-canvas.spec.ts --project=chromium -g "workflow canvas undo and redo controls"
bunx playwright test tests/workflow-canvas.spec.ts --project=chromium -g "workflow canvas opens the config card|workflow canvas drag/sync/reload"
```

## Non-goals

This feature should not:

- Implement a full graph snapshot history stack.
- Add a REST undo endpoint.
- Change the collaboration server protocol.
- Include runtime facts, task status, query data, or local media playback in
  undo history.
- Make another client's undo stack visible or controllable.
- Rehydrate Zustand from undo snapshots.
- Persist undo stacks across reloads.

Undo history is intentionally per-client and per-mounted ydoc. Reloading the
page clears local undo history.

## Acceptance criteria

The implementation is complete when:

- Local graph edits produce undoable Yjs stack items.
- Remote edits do not enter the local undo stack.
- Undo/redo operations project through the existing ydoc -> store path.
- Peers see undo/redo results through the normal collaboration channel.
- Local undo does not overwrite a newer remote Y.Map value.
- Node deletion undo restores nodes, incident edges, and affected media slot
  state atomically.
- Structure operations do not accidentally merge with nearby operations.
- Pure text typing can merge into a natural undo step.
- Controls and keyboard shortcuts work without intercepting native text
  editing undo.
- No service-side changes are required.

## References

- Yjs UndoManager API: https://docs.yjs.dev/api/undo-manager
- Yjs 13.6.30 local source:
  `apps/web/node_modules/yjs/src/utils/UndoManager.js`
- React Flow undo/redo example:
  https://reactflow.dev/examples/interaction/undo-redo
- React Flow collaborative example:
  https://reactflow.dev/examples/interaction/collaborative
- Local collaboration model:
  `docs/design/workflow-canvas-collaboration/02-ideal-sync-model.md`
- Local runtime event split:
  `docs/design/workflow-canvas-collaboration/05-runtime-event-stream.md`
