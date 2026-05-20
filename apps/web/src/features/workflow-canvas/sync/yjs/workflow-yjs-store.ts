import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import * as Y from 'yjs'

import type { WorkflowYDocHandles } from './yjs-document'

interface WorkflowYjsRuntimeState {
  edges: WorkflowCanvasEdge[]
  nodes: WorkflowCanvasNode[]
  providerStatus: 'connected' | 'connecting' | 'disconnected'
  synced: boolean
  workflowId: string
  y: WorkflowYDocHandles
}

const runtimes = new Map<string, WorkflowYjsRuntimeState>()

export const registerWorkflowYjsRuntime = (
  workflowId: string,
  y: WorkflowYDocHandles,
  snapshot: { edges: WorkflowCanvasEdge[]; nodes: WorkflowCanvasNode[] },
): void => {
  runtimes.set(workflowId, {
    edges: snapshot.edges,
    nodes: snapshot.nodes,
    providerStatus: 'connecting',
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
  snapshot: { edges: WorkflowCanvasEdge[]; nodes: WorkflowCanvasNode[] },
): void => {
  const runtime = runtimes.get(workflowId)
  if (!runtime) {
    return
  }
  runtime.edges = snapshot.edges
  runtime.nodes = snapshot.nodes
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

export const getWorkflowYjsStateVector = (workflowId: string): Uint8Array | undefined => {
  const runtime = runtimes.get(workflowId)
  return runtime ? Y.encodeStateVector(runtime.y.ydoc) : undefined
}
