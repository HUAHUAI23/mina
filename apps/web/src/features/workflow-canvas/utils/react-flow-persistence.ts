import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

const stableNode = (node: WorkflowCanvasNode): WorkflowCanvasNode => ({
  id: node.id,
  type: node.type,
  position: node.position,
  ...(node.parentId ? { parentId: node.parentId } : {}),
  ...(node.extent ? { extent: node.extent } : {}),
  ...(node.width ? { width: node.width } : {}),
  ...(node.height ? { height: node.height } : {}),
  data: node.data,
})

export const sortParentNodesFirst = (nodes: readonly WorkflowCanvasNode[]): WorkflowCanvasNode[] => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const depth = (node: WorkflowCanvasNode): number => {
    let value = 0
    let current = node
    while (current.parentId) {
      const parent = nodeMap.get(current.parentId)
      if (!parent) {
        break
      }
      value += 1
      current = parent
    }
    return value
  }
  return [...nodes].map(stableNode).sort((left, right) => depth(left) - depth(right))
}

export const stableEdges = (edges: readonly WorkflowCanvasEdge[]): WorkflowCanvasEdge[] =>
  edges.map((edge) => ({
    id: edge.id,
    type: edge.type ?? 'media',
    source: edge.source,
    target: edge.target,
    ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
    ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
    data: edge.data,
  }))
