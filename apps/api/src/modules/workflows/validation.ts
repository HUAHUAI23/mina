import type {
  WorkflowCanvasEdge,
  WorkflowCanvasNode,
} from '@mina/contracts/modules/canvas'

import { HttpError } from '../../lib/http/http-error'
import {
  getNodeMap,
  isDescendantOf,
  isExecutableNode,
  isGroupNode,
} from './graph'
import {
  mediaSlotItemsForNode,
  nodeOutputDependenciesForNode,
} from './media/node-media-slots'

export const validateCanvas = (
  nodes: WorkflowCanvasNode[],
  edges: WorkflowCanvasEdge[],
): void => {
  const nodeMap = getNodeMap(nodes)
  for (const node of nodes) {
    if (node.type !== node.data.nodeType) {
      throw new HttpError(
        422,
        'WORKFLOW_NODE_TYPE_MISMATCH',
        'Workflow node type must match node data type.',
      )
    }
    if (node.parentId) {
      const parent = nodeMap.get(node.parentId)
      if (!parent || !isGroupNode(parent)) {
        throw new HttpError(
          422,
          'WORKFLOW_PARENT_NOT_FOUND',
          'Workflow node parent must be a group node.',
        )
      }
    }
  }

  for (const edge of edges) {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
      throw new HttpError(
        422,
        'WORKFLOW_EDGE_NODE_NOT_FOUND',
        'Workflow edge source and target must exist.',
      )
    }
  }

  validateMediaSlotEdges(nodes, edges)
}

export const validateFlowGroup = (
  nodes: WorkflowCanvasNode[],
  edges: WorkflowCanvasEdge[],
  scopeGroupNodeId: string,
): void => {
  const nodeMap = getNodeMap(nodes)
  const scopedNodeIds = new Set(
    nodes
      .filter((node) => isDescendantOf(node.id, scopeGroupNodeId, nodeMap))
      .map((node) => node.id),
  )

  for (const edge of edges) {
    const sourceInScope = scopedNodeIds.has(edge.source)
    const targetInScope = scopedNodeIds.has(edge.target)
    if (sourceInScope !== targetInScope) {
      throw new HttpError(
        422,
        'WORKFLOW_CROSS_FLOW_EDGE',
        'Flow group execution does not support cross-scope edges.',
      )
    }
  }

  const executableIds = new Set(
    nodes
      .filter((node) => isExecutableNode(node) && scopedNodeIds.has(node.id))
      .map((node) => node.id),
  )
  const executableEdges = nodes
    .filter((node) => executableIds.has(node.id))
    .flatMap((node) =>
      nodeOutputDependenciesForNode(node, edges)
        .filter((sourceId) => executableIds.has(sourceId))
        .map((sourceId) => ({ source: sourceId, target: node.id })),
    )
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
    for (const edge of executableEdges.filter(
      (candidate) => candidate.source === current,
    )) {
      const nextDegree = (inDegree.get(edge.target) ?? 0) - 1
      inDegree.set(edge.target, nextDegree)
      if (nextDegree === 0) {
        ready.push(edge.target)
      }
    }
  }

  if (visited !== executableIds.size) {
    throw new HttpError(
      422,
      'WORKFLOW_FLOW_CYCLE',
      'Flow group execution graph must be acyclic.',
    )
  }
}

const validateMediaSlotEdges = (
  nodes: WorkflowCanvasNode[],
  edges: WorkflowCanvasEdge[],
): void => {
  const nodeMap = getNodeMap(nodes)
  for (const node of nodes) {
    const items = mediaSlotItemsForNode(node, edges)
    for (const item of items) {
      const source = item.source
      if (source.type !== 'node_output') {
        continue
      }
      const matchingEdge = edges.find((edge) => {
        if (edge.source !== source.nodeId || edge.target !== node.id) {
          return false
        }
        if (edge.data.connection.kind === 'media_link') {
          return edge.data.connection.targetSlotItemId === item.id
        }
        return true
      })
      if (!matchingEdge) {
        throw new HttpError(
          422,
          'WORKFLOW_MEDIA_SLOT_EDGE_MISSING',
          'Node output media slot must have a matching edge.',
        )
      }
      if (!nodeMap.has(source.nodeId)) {
        throw new HttpError(
          422,
          'WORKFLOW_MEDIA_SLOT_NODE_NOT_FOUND',
          'Media slot source node must exist.',
        )
      }
    }
  }

  for (const edge of edges) {
    if (edge.data.connection.kind !== 'media_link') {
      continue
    }
    const target = nodeMap.get(edge.target)
    if (!target) {
      continue
    }
    const connection = edge.data.connection
    const matchingItem = mediaSlotItemsForNode(target, edges).find(
      (item) =>
        item.id === connection.targetSlotItemId &&
        item.source.type === 'node_output' &&
        item.source.nodeId === edge.source,
    )
    if (!matchingItem) {
      throw new HttpError(
        422,
        'WORKFLOW_MEDIA_EDGE_SLOT_MISSING',
        'Media edge must point to a matching media slot item.',
      )
    }
  }
}
