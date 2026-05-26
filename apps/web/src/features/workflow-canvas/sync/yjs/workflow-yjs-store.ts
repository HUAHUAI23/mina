import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import * as Y from 'yjs'

import type { WorkflowYDocHandles } from './yjs-document'
import { workflowYjsSnapshotSignature } from './yjs-document'

interface WorkflowYjsSnapshotRefs {
  edges: WorkflowCanvasEdge[]
  nodes: WorkflowCanvasNode[]
}

interface WorkflowYjsRuntimeState {
  edges: WorkflowCanvasEdge[]
  nodes: WorkflowCanvasNode[]
  providerStatus: 'connected' | 'connecting' | 'disconnected'
  synced: boolean
  workflowId: string
  y: WorkflowYDocHandles
  snapshotSignature: string
}

const runtimes = new Map<string, WorkflowYjsRuntimeState>()

export const registerWorkflowYjsRuntime = (
  workflowId: string,
  y: WorkflowYDocHandles,
  snapshot: WorkflowYjsSnapshotRefs,
): void => {
  runtimes.set(workflowId, {
    edges: snapshot.edges,
    nodes: snapshot.nodes,
    providerStatus: 'connecting',
    snapshotSignature: workflowYjsSnapshotSignature(snapshot),
    synced: false,
    workflowId,
    y,
  })
}

export const unregisterWorkflowYjsRuntime = (
  workflowId: string,
  y: WorkflowYDocHandles,
): void => {
  const runtime = runtimes.get(workflowId)
  if (runtime?.y !== y) {
    return
  }
  runtimes.delete(workflowId)
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
