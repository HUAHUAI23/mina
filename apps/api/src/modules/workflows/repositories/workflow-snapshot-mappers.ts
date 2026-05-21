import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import { normalizeWorkflowEdge, normalizeWorkflowNode } from './workflow-mappers'

interface NodeSnapshotRow {
  data: WorkflowCanvasNode['data']
  extent: WorkflowCanvasNode['extent'] | null
  height: string | null
  nodeId: string
  parentId: string | null
  positionX: string
  positionY: string
  type: WorkflowCanvasNode['type']
  width: string | null
}

interface EdgeSnapshotRow {
  data: WorkflowCanvasEdge['data']
  edgeId: string
  sourceHandle: string | null
  sourceNodeId: string
  targetHandle: string | null
  targetNodeId: string
  type: string
}

export const workflowNodeFromSnapshotRow = (row: NodeSnapshotRow): WorkflowCanvasNode =>
  normalizeWorkflowNode({
    id: row.nodeId,
    type: row.type,
    position: {
      x: Number(row.positionX),
      y: Number(row.positionY),
    },
    ...(row.parentId ? { parentId: row.parentId } : {}),
    ...(row.extent ? { extent: row.extent } : {}),
    ...(row.width !== null ? { width: Number(row.width) } : {}),
    ...(row.height !== null ? { height: Number(row.height) } : {}),
    data: row.data,
  })

export const workflowEdgeFromSnapshotRow = (row: EdgeSnapshotRow): WorkflowCanvasEdge =>
  normalizeWorkflowEdge({
    id: row.edgeId,
    type: row.type as WorkflowCanvasEdge['type'],
    source: row.sourceNodeId,
    target: row.targetNodeId,
    ...(row.sourceHandle ? { sourceHandle: row.sourceHandle } : {}),
    ...(row.targetHandle ? { targetHandle: row.targetHandle } : {}),
    data: row.data,
  })

export const workflowNodeSnapshotRows = (
  workflowRunId: string,
  nodes: WorkflowCanvasNode[],
  timestamp: string,
): Array<{
  createdAt: Date
  data: WorkflowCanvasNode['data']
  extent: WorkflowCanvasNode['extent'] | null
  height: string | null
  nodeId: string
  parentId: string | null
  positionX: string
  positionY: string
  sortOrder: number
  type: WorkflowCanvasNode['type']
  width: string | null
  workflowRunId: string
}> =>
  nodes.map((node, index) => ({
    workflowRunId,
    nodeId: node.id,
    type: node.type,
    positionX: String(node.position.x),
    positionY: String(node.position.y),
    parentId: node.parentId ?? null,
    extent: node.extent ?? null,
    width: node.width === undefined ? null : String(node.width),
    height: node.height === undefined ? null : String(node.height),
    data: node.data,
    sortOrder: index,
    createdAt: new Date(timestamp),
  }))

export const workflowEdgeSnapshotRows = (
  workflowRunId: string,
  edges: WorkflowCanvasEdge[],
  timestamp: string,
): Array<{
  createdAt: Date
  data: WorkflowCanvasEdge['data']
  edgeId: string
  sourceHandle: string | null
  sourceNodeId: string
  targetHandle: string | null
  targetNodeId: string
  type: string
  sortOrder: number
  workflowRunId: string
}> =>
  edges.map((edge, index) => ({
    workflowRunId,
    edgeId: edge.id,
    type: edge.type ?? 'media',
    sourceNodeId: edge.source,
    targetNodeId: edge.target,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
    data: edge.data,
    sortOrder: index,
    createdAt: new Date(timestamp),
  }))
