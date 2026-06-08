import { getWorkflowNodeBounds } from '../domain/canvas-node-geometry'
import type { WorkflowFlowNode } from '../domain/flow-types'

const GROUP_ATTACH_LEADING_TOLERANCE = 24

const isGroupFlowNode = (node: WorkflowFlowNode | undefined): boolean =>
  node?.type === 'flow_group' || node?.type === 'node_group'

const boundsOverlapRatio = (
  left: ReturnType<typeof getWorkflowNodeBounds>,
  right: ReturnType<typeof getWorkflowNodeBounds>,
): number => {
  const overlapWidth = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left))
  const overlapHeight = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top))
  const overlapArea = overlapWidth * overlapHeight
  const leftArea = left.width * left.height
  return leftArea > 0 ? overlapArea / leftArea : 0
}

export const absoluteFlowNodePosition = (
  node: WorkflowFlowNode,
  nodeMap: ReadonlyMap<string, WorkflowFlowNode>,
): { x: number; y: number } => {
  let current: WorkflowFlowNode | undefined = node
  let x = current.position.x
  let y = current.position.y
  while (current.parentId) {
    const parent = nodeMap.get(current.parentId)
    if (!parent) {
      break
    }
    x += parent.position.x
    y += parent.position.y
    current = parent
  }
  return { x, y }
}

export const resolveGroupAttachTargetForNode = (
  node: WorkflowFlowNode,
  nodes: readonly WorkflowFlowNode[],
): WorkflowFlowNode | undefined => {
  if (isGroupFlowNode(node)) {
    return undefined
  }
  const nodeMap = new Map(nodes.map((candidate) => [candidate.id, candidate]))
  const nodeBounds = getWorkflowNodeBounds(node, absoluteFlowNodePosition(node, nodeMap))
  return nodes
    .filter((candidate) => isGroupFlowNode(candidate) && candidate.id !== node.id && candidate.id !== node.parentId)
    .sort((left, right) => {
      const leftSize = getWorkflowNodeBounds(left, absoluteFlowNodePosition(left, nodeMap))
      const rightSize = getWorkflowNodeBounds(right, absoluteFlowNodePosition(right, nodeMap))
      return leftSize.width * leftSize.height - rightSize.width * rightSize.height
    })
    .find((candidate) => {
      const groupBounds = getWorkflowNodeBounds(candidate, absoluteFlowNodePosition(candidate, nodeMap))
      const centerX = (nodeBounds.left + nodeBounds.right) / 2
      const centerY = (nodeBounds.top + nodeBounds.bottom) / 2
      const centerInsideGroup = (
        centerX >= groupBounds.left &&
        centerX <= groupBounds.right &&
        centerY >= groupBounds.top &&
        centerY <= groupBounds.bottom
      )
      return (
        centerInsideGroup ||
        (
          boundsOverlapRatio(nodeBounds, groupBounds) >= 0.32 &&
          nodeBounds.left >= groupBounds.left - GROUP_ATTACH_LEADING_TOLERANCE &&
          nodeBounds.top >= groupBounds.top - GROUP_ATTACH_LEADING_TOLERANCE
        )
      )
    })
}
