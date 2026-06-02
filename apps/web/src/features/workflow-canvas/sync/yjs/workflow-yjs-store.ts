import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import * as Y from 'yjs'

import type { WorkflowYDocHandles } from './yjs-document'
import { workflowYjsSnapshotSignature } from './yjs-document'

interface WorkflowYjsSnapshotRefs {
  edges: WorkflowCanvasEdge[]
  nodes: WorkflowCanvasNode[]
}

export interface WorkflowYjsRuntimeState {
  edges: WorkflowCanvasEdge[]
  nodes: WorkflowCanvasNode[]
  providerStatus: 'connected' | 'connecting' | 'disconnected'
  synced: boolean
  undo: Y.UndoManager
  workflowId: string
  y: WorkflowYDocHandles
  snapshotSignature: string
}

type WorkflowYjsRuntimeListener = () => void

const runtimes = new Map<string, WorkflowYjsRuntimeState>()
const runtimeListeners = new Map<string, Set<WorkflowYjsRuntimeListener>>()

const createWorkflowUndoManager = (y: WorkflowYDocHandles): Y.UndoManager =>
  new Y.UndoManager(
    [y.nodes, y.nodeFrames, y.nodeOrder, y.edges, y.edgeOrder],
    {
      captureTimeout: 500,
      trackedOrigins: new Set(['mina-local']),
    },
  )

const emitWorkflowYjsRuntimeChange = (workflowId: string): void => {
  runtimeListeners.get(workflowId)?.forEach((listener) => listener())
}

export const registerWorkflowYjsRuntime = (
  workflowId: string,
  y: WorkflowYDocHandles,
  snapshot: WorkflowYjsSnapshotRefs,
): void => {
  runtimes.get(workflowId)?.undo.destroy()
  const undo = createWorkflowUndoManager(y)
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

export const updateWorkflowYjsRuntimeSnapshot = (
  workflowId: string,
  snapshot: WorkflowYjsSnapshotRefs,
  snapshotSignature = workflowYjsSnapshotSignature(snapshot),
): void => {
  const runtime = runtimes.get(workflowId)
  if (!runtime) {
    return
  }
  runtime.edges = snapshot.edges
  runtime.nodes = snapshot.nodes
  runtime.snapshotSignature = snapshotSignature
}

export const updateWorkflowYjsRuntimeConnection = (
  workflowId: string,
  input: Partial<Pick<WorkflowYjsRuntimeState, 'providerStatus' | 'synced'>>,
): void => {
  const runtime = runtimes.get(workflowId)
  if (!runtime) {
    return
  }
  Object.assign(runtime, input)
}

export const getWorkflowYjsRuntimeForWorkflow = (
  workflowId: string,
): WorkflowYjsRuntimeState | undefined => runtimes.get(workflowId)

export const subscribeWorkflowYjsRuntime = (
  workflowId: string,
  listener: WorkflowYjsRuntimeListener,
): (() => void) => {
  const listeners = runtimeListeners.get(workflowId) ?? new Set<WorkflowYjsRuntimeListener>()
  listeners.add(listener)
  runtimeListeners.set(workflowId, listeners)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      runtimeListeners.delete(workflowId)
    }
  }
}

export const getWorkflowYjsRuntimeSnapshotSignature = (
  workflowId: string,
  snapshot?: WorkflowYjsSnapshotRefs,
): string | undefined => {
  const runtime = runtimes.get(workflowId)
  if (!runtime) {
    return undefined
  }
  if (snapshot && (runtime.edges !== snapshot.edges || runtime.nodes !== snapshot.nodes)) {
    return undefined
  }
  return runtime.snapshotSignature
}

export const getWorkflowYjsStateVector = (workflowId: string): Uint8Array | undefined => {
  const runtime = runtimes.get(workflowId)
  return runtime ? Y.encodeStateVector(runtime.y.ydoc) : undefined
}
