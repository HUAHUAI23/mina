import type { ResizeParamsWithDirection } from '@xyflow/react'

import {
  getWorkflowNodeBounds,
  WORKFLOW_GROUP_PADDING_BOTTOM,
  WORKFLOW_GROUP_PADDING_TOP,
  WORKFLOW_GROUP_PADDING_X,
} from './canvas-node-geometry'
import type { WorkflowFlowNode } from './flow-types'

interface WorkflowGroupResizePolicyInput {
  childNodes: readonly WorkflowFlowNode[]
  groupNode: WorkflowFlowNode | undefined
  minHeight: number
  minWidth: number
  params: ResizeParamsWithDirection
}

export const canResizeWorkflowGroup = ({
  childNodes,
  groupNode,
  minHeight,
  minWidth,
  params,
}: WorkflowGroupResizePolicyInput): boolean => {
  if (!groupNode) {
    return false
  }
  if (childNodes.length === 0) {
    return params.width >= minWidth && params.height >= minHeight
  }

  const delta = {
    x: params.x - groupNode.position.x,
    y: params.y - groupNode.position.y,
  }
  const childBounds = childNodes.map((node) =>
    getWorkflowNodeBounds(node, {
      x: node.position.x - delta.x,
      y: node.position.y - delta.y,
    }),
  )
  const left = Math.min(...childBounds.map((bounds) => bounds.left))
  const top = Math.min(...childBounds.map((bounds) => bounds.top))
  const right = Math.max(...childBounds.map((bounds) => bounds.right))
  const bottom = Math.max(...childBounds.map((bounds) => bounds.bottom))

  return (
    left >= WORKFLOW_GROUP_PADDING_X &&
    top >= WORKFLOW_GROUP_PADDING_TOP &&
    params.width >= Math.max(minWidth, right + WORKFLOW_GROUP_PADDING_X) &&
    params.height >= Math.max(minHeight, bottom + WORKFLOW_GROUP_PADDING_BOTTOM)
  )
}
