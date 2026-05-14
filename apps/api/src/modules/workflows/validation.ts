import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import { HttpError } from '../../lib/http/http-error'
import {
  getNodeMap,
  getOutgoingEdges,
  isDescendantOf,
  isExecutableNode,
  isGroupNode,
} from './graph'

export const validateCanvas = (nodes: WorkflowCanvasNode[], edges: WorkflowCanvasEdge[]): void => {
  const nodeMap = getNodeMap(nodes)
  for (const node of nodes) {
    if (node.type !== node.data.nodeType) {
      throw new HttpError(422, 'WORKFLOW_NODE_TYPE_MISMATCH', 'Workflow node type must match node data type.')
    }
    if (node.parentId) {
      const parent = nodeMap.get(node.parentId)
      if (!parent || !isGroupNode(parent)) {
        throw new HttpError(422, 'WORKFLOW_PARENT_NOT_FOUND', 'Workflow node parent must be a group node.')
      }
    }
  }

  for (const edge of edges) {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
      throw new HttpError(422, 'WORKFLOW_EDGE_NODE_NOT_FOUND', 'Workflow edge source and target must exist.')
    }
  }
}

export const validateFlowGroup = (
  nodes: WorkflowCanvasNode[],
  edges: WorkflowCanvasEdge[],
  scopeGroupNodeId: string,
): void => {
  const nodeMap = getNodeMap(nodes)
  const scopedNodeIds = new Set(
    nodes.filter((node) => isDescendantOf(node.id, scopeGroupNodeId, nodeMap)).map((node) => node.id),
  )

  for (const edge of edges) {
    const sourceInScope = scopedNodeIds.has(edge.source)
    const targetInScope = scopedNodeIds.has(edge.target)
    if (sourceInScope !== targetInScope) {
      throw new HttpError(422, 'WORKFLOW_CROSS_FLOW_EDGE', 'Flow group execution does not support cross-scope edges.')
    }
  }

  const executableIds = new Set(
    nodes
      .filter((node) => isExecutableNode(node) && scopedNodeIds.has(node.id))
      .map((node) => node.id),
  )
  const executableEdges = edges.filter((edge) => executableIds.has(edge.source) && executableIds.has(edge.target))
  const inDegree = new Map(Array.from(executableIds).map((id) => [id, 0]))
  for (const edge of executableEdges) {
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
  }

  const ready = Array.from(inDegree.entries())
    .filter((entry) => entry[1] === 0)
    .map((entry) => entry[0])
  let visited = 0
  while (ready.length > 0) {
    const current = ready.shift()
    if (!current) {
      continue
    }
    visited += 1
    for (const edge of getOutgoingEdges(current, executableEdges)) {
      const nextDegree = (inDegree.get(edge.target) ?? 0) - 1
      inDegree.set(edge.target, nextDegree)
      if (nextDegree === 0) {
        ready.push(edge.target)
      }
    }
  }

  if (visited !== executableIds.size) {
    throw new HttpError(422, 'WORKFLOW_FLOW_CYCLE', 'Flow group execution graph must be acyclic.')
  }
}
