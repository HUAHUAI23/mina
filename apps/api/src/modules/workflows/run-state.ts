import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import type { WorkflowRun, WorkflowRunNodeState } from '@mina/contracts/modules/workflows'
import { createLocalizedErrorDetails } from '../../lib/http/localized-error'

import { getNodeMap, isDescendantOf, isExecutableNode } from './graph'

const nowIso = (): string => new Date().toISOString()

export const createInitialNodeStates = (
  nodes: WorkflowCanvasNode[],
  selectedNodeId: string,
  scopeGroupNodeId: string | undefined,
): Record<string, WorkflowRunNodeState> => {
  if (!scopeGroupNodeId) {
    return {
      [selectedNodeId]: {
        status: 'pending',
      },
    }
  }

  const nodeMap = getNodeMap(nodes)
  return Object.fromEntries(
    nodes
      .filter((node) => isExecutableNode(node) && isDescendantOf(node.id, scopeGroupNodeId, nodeMap))
      .map((node) => [node.id, { status: 'pending' as const }]),
  )
}

export const succeededRun = (run: WorkflowRun): WorkflowRun => {
  const completedAt = nowIso()
  return {
    ...run,
    status: 'succeeded',
    completedAt,
    updatedAt: completedAt,
  }
}

export const failedRun = (run: WorkflowRun, message: string, nodeId?: string): WorkflowRun => {
  const failedAt = nowIso()
  const error = createLocalizedErrorDetails({
    code: 'WORKFLOW_RUN_FAILED',
    debugMessage: message,
    fallbackMessage: message,
    messageKey: 'api_error_workflow_run_failed',
  })
  const failedNodeStates =
    nodeId && run.nodeStates[nodeId]
      ? {
          ...run.nodeStates,
          [nodeId]: {
            ...run.nodeStates[nodeId],
            status: 'failed' as const,
            error,
            completedAt: failedAt,
          },
        }
      : run.nodeStates

  return {
    ...run,
    nodeStates: failedNodeStates,
    status: 'failed',
    error,
    completedAt: failedAt,
    updatedAt: failedAt,
  }
}

export const settledFailedRun = (run: WorkflowRun): WorkflowRun => {
  const completedAt = nowIso()
  return {
    ...run,
    status: 'failed',
    completedAt,
    updatedAt: completedAt,
  }
}

export const workflowNodeSucceededState = (
  currentState: WorkflowRunNodeState,
  output: NonNullable<WorkflowRunNodeState['output']>,
): WorkflowRunNodeState => ({
  ...currentState,
  status: 'succeeded',
  output,
  completedAt: nowIso(),
})

export const workflowNodeRunningState = (taskId: string): WorkflowRunNodeState => ({
  status: 'running',
  taskId,
  startedAt: nowIso(),
})
