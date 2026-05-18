import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

export const getNodeMap = (nodes: readonly WorkflowCanvasNode[]): Map<string, WorkflowCanvasNode> =>
  new Map(nodes.map((node) => [node.id, node]))

export const findNearestFlowGroupId = (
  nodeId: string,
  nodeMap: Map<string, WorkflowCanvasNode>,
): string | undefined => {
  let current = nodeMap.get(nodeId)
  while (current?.parentId) {
    const parent = nodeMap.get(current.parentId)
    if (!parent) {
      return undefined
    }
    if (parent.data.nodeType === 'flow_group') {
      return parent.id
    }
    current = parent
  }
  return undefined
}

export const shareFlowGroupScope = (
  source: WorkflowCanvasNode,
  target: WorkflowCanvasNode,
  nodes: readonly WorkflowCanvasNode[],
): boolean => {
  const nodeMap = getNodeMap(nodes)
  const sourceGroupId = findNearestFlowGroupId(source.id, nodeMap)
  return Boolean(sourceGroupId && sourceGroupId === findNearestFlowGroupId(target.id, nodeMap))
}
