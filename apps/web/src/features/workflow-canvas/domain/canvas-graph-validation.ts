import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import {
  WorkflowCanvasEdgeSchema,
  WorkflowCanvasNodeSchema,
} from '@mina/contracts/modules/canvas'

import { mediaSlotItems } from '../utils/media-slots'
import { isGroupNodeType } from './canvas-node-types'

type SchemaParseResult =
  | { success: true }
  | {
    error: {
      issues?: readonly {
        message: string
        path: readonly PropertyKey[]
      }[]
      message: string
    }
    success: false
  }

const schemaViolations = (label: string, id: string, result: SchemaParseResult): string[] => {
  if (result.success) {
    return []
  }
  if (!result.error?.issues?.length) {
    return [`${label} ${id} failed schema validation.`]
  }
  return result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `.${issue.path.map(String).join('.')}` : ''
    return `${label} ${id}${path}: ${issue.message}`
  })
}

export const collectWorkflowCanvasGraphViolations = (
  nodes: readonly WorkflowCanvasNode[],
  edges: readonly WorkflowCanvasEdge[],
): string[] => {
  const violations: string[] = []
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  for (const node of nodes) {
    violations.push(...schemaViolations('Workflow node', node.id, WorkflowCanvasNodeSchema.safeParse(node)))
    if (node.type !== node.data.nodeType) {
      violations.push(`Workflow node ${node.id} type must match node data type.`)
    }
    if (node.parentId) {
      const parent = nodeMap.get(node.parentId)
      if (!parent || !isGroupNodeType(parent.data.nodeType)) {
        violations.push(`Workflow node ${node.id} parent must be a group node.`)
      }
    }
  }

  for (const edge of edges) {
    violations.push(...schemaViolations('Workflow edge', edge.id, WorkflowCanvasEdgeSchema.safeParse(edge)))
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
      violations.push(`Workflow edge ${edge.id} source and target must exist.`)
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
        violations.push(`Node ${node.id} output media slot ${item.id} must have a matching edge.`)
      }
      if (!nodeMap.has(sourceNodeId)) {
        violations.push(`Node ${node.id} media slot ${item.id} source node must exist.`)
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
      violations.push(`Media edge ${edge.id} must point to a matching media slot item.`)
    }
  }
  return violations
}

export const validateWorkflowCanvasGraph = (
  nodes: readonly WorkflowCanvasNode[],
  edges: readonly WorkflowCanvasEdge[],
): void => {
  const violations = collectWorkflowCanvasGraphViolations(nodes, edges)
  if (violations.length === 0) {
    return
  }
  const message = `Graph invariant violated:\n${violations.map((violation) => `  - ${violation}`).join('\n')}`
  if (!import.meta.env.PROD) {
    throw new Error(message)
  }
  console.error(message)
}
