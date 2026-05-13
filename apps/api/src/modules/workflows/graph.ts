import type {
  NodeMediaViewState,
  WorkflowCanvasEdge,
  WorkflowCanvasNode,
} from '@mina/contracts'

export type MediaWorkflowNode = WorkflowCanvasNode & {
  data: {
    nodeType: 'image_generation' | 'video_generation'
    mediaView?: NodeMediaViewState
  }
}

export const getNodeMap = (nodes: WorkflowCanvasNode[]): Map<string, WorkflowCanvasNode> =>
  new Map(nodes.map((node) => [node.id, node]))

export const getIncomingEdges = (nodeId: string, edges: WorkflowCanvasEdge[]): WorkflowCanvasEdge[] =>
  edges.filter((edge) => edge.target === nodeId)

export const getOutgoingEdges = (nodeId: string, edges: WorkflowCanvasEdge[]): WorkflowCanvasEdge[] =>
  edges.filter((edge) => edge.source === nodeId)

export const isExecutableNode = (node: WorkflowCanvasNode): boolean =>
  node.data.nodeType === 'image_generation' || node.data.nodeType === 'video_generation'

export const isGroupNode = (node: WorkflowCanvasNode): boolean =>
  node.data.nodeType === 'flow_group' || node.data.nodeType === 'node_group'

export const isMediaWorkflowNode = (node: WorkflowCanvasNode): node is MediaWorkflowNode =>
  node.data.nodeType === 'image_generation' || node.data.nodeType === 'video_generation'

export const isDescendantOf = (
  nodeId: string,
  ancestorId: string,
  nodeMap: Map<string, WorkflowCanvasNode>,
): boolean => {
  let current = nodeMap.get(nodeId)
  while (current?.parentId) {
    if (current.parentId === ancestorId) {
      return true
    }
    current = nodeMap.get(current.parentId)
  }
  return false
}

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

export const sortNodesForExecution = (nodes: WorkflowCanvasNode[]): WorkflowCanvasNode[] =>
  [...nodes].sort((left, right) => {
    const yDiff = left.position.y - right.position.y
    if (yDiff !== 0) return yDiff
    const xDiff = left.position.x - right.position.x
    if (xDiff !== 0) return xDiff
    return left.id.localeCompare(right.id)
  })

export const getExecutablePredecessors = (
  nodeId: string,
  edges: WorkflowCanvasEdge[],
  nodeMap: Map<string, WorkflowCanvasNode>,
): WorkflowCanvasNode[] =>
  edges
    .filter((edge) => edge.target === nodeId)
    .map((edge) => nodeMap.get(edge.source))
    .filter((node): node is WorkflowCanvasNode => node !== undefined && isExecutableNode(node))
