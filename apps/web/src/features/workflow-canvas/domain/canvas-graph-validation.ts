import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import {
  WorkflowCanvasEdgeSchema,
  WorkflowCanvasNodeSchema,
} from '@mina/contracts/modules/canvas'

import { mediaSlotItems } from '../utils/media-slots'
import { isGroupNodeType } from './canvas-node-types'

export const validateWorkflowCanvasGraph = (
  nodes: readonly WorkflowCanvasNode[],
  edges: readonly WorkflowCanvasEdge[],
): void => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  for (const node of nodes) {
    WorkflowCanvasNodeSchema.parse(node)
    if (node.type !== node.data.nodeType) {
      throw new Error('Workflow node type must match node data type.')
    }
    if (node.parentId) {
      const parent = nodeMap.get(node.parentId)
      if (!parent || !isGroupNodeType(parent.data.nodeType)) {
        throw new Error('Workflow node parent must be a group node.')
      }
    }
  }

  for (const edge of edges) {
    WorkflowCanvasEdgeSchema.parse(edge)
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
      throw new Error('Workflow edge source and target must exist.')
    }
  }

  for (const node of nodes) {
    for (const item of mediaSlotItems(node)) {
      if (item.source.type !== 'node_output') {
        continue
      }
      const sourceNodeId = item.source.nodeId
      const matchingEdge = edges.find((edge) => {
        if (edge.source !== sourceNodeId || edge.target !== node.id) {
          return false
        }
        return edge.data.connection?.targetSlotItemId === item.id
      })
      if (!matchingEdge) {
        throw new Error('Node output media slot must have a matching edge.')
      }
      if (!nodeMap.has(sourceNodeId)) {
        throw new Error('Media slot source node must exist.')
      }
    }
  }

  for (const edge of edges) {
    const connection = edge.data.connection
    if (!connection) {
      continue
    }
    const target = nodeMap.get(edge.target)
    if (!target) {
      continue
    }
    const matchingItem = mediaSlotItems(target).find(
      (item) =>
        item.id === connection.targetSlotItemId &&
        item.source.type === 'node_output' &&
        item.source.nodeId === edge.source,
    )
    if (!matchingItem) {
      throw new Error('Media edge must point to a matching media slot item.')
    }
  }
}
