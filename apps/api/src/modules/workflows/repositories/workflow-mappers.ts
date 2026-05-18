import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import type { Workflow, WorkflowRun, WorkflowRunNodeState } from '@mina/contracts/modules/workflows'
import { WorkflowCanvasEdgeSchema, WorkflowCanvasNodeSchema } from '@mina/contracts/modules/canvas'
import { WorkflowRunNodeStateSchema, WorkflowRunSchema, WorkflowSchema } from '@mina/contracts/modules/workflows'

import type { WorkflowRunRecord } from './workflow-types'

export const toIso = (value: Date): string => value.toISOString()

export const toDate = (value: string | undefined): Date | null => (value ? new Date(value) : null)

export const cloneWorkflow = (workflow: Workflow): Workflow => structuredClone(workflow)

export const cloneRun = (run: WorkflowRun): WorkflowRun => structuredClone(run)

export const normalizeWorkflowNode = (node: WorkflowCanvasNode): WorkflowCanvasNode =>
  WorkflowCanvasNodeSchema.parse({
    id: node.id,
    type: node.type,
    position: {
      x: node.position.x,
      y: node.position.y,
    },
    ...(node.parentId ? { parentId: node.parentId } : {}),
    ...(node.extent ? { extent: node.extent } : {}),
    ...(node.width !== undefined ? { width: node.width } : {}),
    ...(node.height !== undefined ? { height: node.height } : {}),
    data: node.data,
  })

export const normalizeWorkflowEdge = (edge: WorkflowCanvasEdge): WorkflowCanvasEdge =>
  WorkflowCanvasEdgeSchema.parse({
    id: edge.id,
    type: edge.type,
    source: edge.source,
    target: edge.target,
    ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
    ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
    data: edge.data,
  })

export const workflowDto = (input: {
  accountId: string
  createdAt: string
  edges: WorkflowCanvasEdge[]
  id: string
  name: string
  nodes: WorkflowCanvasNode[]
  updatedAt: string
  version: number
}): Workflow =>
  WorkflowSchema.parse({
    id: input.id,
    accountId: input.accountId,
    name: input.name,
    version: input.version,
    nodes: input.nodes.map(normalizeWorkflowNode),
    edges: input.edges.map(normalizeWorkflowEdge),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  })

export const workflowRunRecordFromRun = (run: WorkflowRun): WorkflowRunRecord => ({
  id: run.id,
  workflowId: run.workflowId,
  accountId: run.accountId,
  workflowVersion: run.workflowVersion,
  runMode: run.runMode,
  selectedNodeId: run.selectedNodeId,
  ...(run.scopeGroupNodeId ? { scopeGroupNodeId: run.scopeGroupNodeId } : {}),
  status: run.status,
  ...(run.error ? { error: run.error } : {}),
  createdAt: run.createdAt,
  updatedAt: run.updatedAt,
  ...(run.startedAt ? { startedAt: run.startedAt } : {}),
  ...(run.completedAt ? { completedAt: run.completedAt } : {}),
})

export const workflowRunDto = (input: {
  nodeStates: Record<string, WorkflowRunNodeState>
  run: WorkflowRunRecord
  snapshotEdges: WorkflowCanvasEdge[]
  snapshotNodes: WorkflowCanvasNode[]
}): WorkflowRun =>
  WorkflowRunSchema.parse({
    id: input.run.id,
    workflowId: input.run.workflowId,
    accountId: input.run.accountId,
    workflowVersion: input.run.workflowVersion,
    runMode: input.run.runMode,
    selectedNodeId: input.run.selectedNodeId,
    ...(input.run.scopeGroupNodeId ? { scopeGroupNodeId: input.run.scopeGroupNodeId } : {}),
    snapshotNodes: input.snapshotNodes.map(normalizeWorkflowNode),
    snapshotEdges: input.snapshotEdges.map(normalizeWorkflowEdge),
    nodeStates: Object.fromEntries(
      Object.entries(input.nodeStates).map(([nodeId, state]) => [nodeId, WorkflowRunNodeStateSchema.parse(state)]),
    ),
    status: input.run.status,
    ...(input.run.error ? { error: input.run.error } : {}),
    createdAt: input.run.createdAt,
    updatedAt: input.run.updatedAt,
    ...(input.run.startedAt ? { startedAt: input.run.startedAt } : {}),
    ...(input.run.completedAt ? { completedAt: input.run.completedAt } : {}),
  })
