import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import type { WorkflowNodeRuntimeRow } from '../repositories/workflow-node-task.repository'

const isMediaNode = (
  node: WorkflowCanvasNode,
): node is WorkflowCanvasNode & { data: { mediaView?: { taskId?: string } } } =>
  node.data.nodeType === 'image_generation' || node.data.nodeType === 'video_generation'

/**
 * Converts the dynamic "follow latest" view into an immutable run snapshot. The collaborative
 * canvas document is not changed; only the nodes copied into a workflow run receive the effective
 * task id that the run should use.
 */
export const materializeEffectiveMediaViews = (
  nodes: readonly WorkflowCanvasNode[],
  runtimeRows: readonly WorkflowNodeRuntimeRow[],
): WorkflowCanvasNode[] => {
  const latestByNodeId = new Map(runtimeRows.map((row) => [row.nodeId, row.latestTaskId]))
  return nodes.map((node) => {
    if (!isMediaNode(node) || node.data.mediaView?.taskId) {
      return structuredClone(node)
    }
    const latestTaskId = latestByNodeId.get(node.id)
    if (!latestTaskId) {
      return structuredClone(node)
    }
    const next = structuredClone(node)
    next.data.mediaView = { taskId: latestTaskId }
    return next
  })
}
