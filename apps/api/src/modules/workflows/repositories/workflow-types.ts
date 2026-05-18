import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import type { WorkflowRunMode, WorkflowRunStatus } from '@mina/contracts/modules/workflows'

export interface WorkflowRunRecord {
  accountId: string
  completedAt?: string
  createdAt: string
  error?: string
  id: string
  runMode: WorkflowRunMode
  scopeGroupNodeId?: string
  selectedNodeId: string
  startedAt?: string
  status: WorkflowRunStatus
  updatedAt: string
  workflowId: string
  workflowVersion: number
}

export interface ClaimedWorkflowRun extends WorkflowRunRecord {
  leaseToken: string
}

export interface WorkflowRunStateSummary {
  failed: number
  pending: number
  running: number
  skipped: number
  succeeded: number
  total: number
}

export interface WorkflowRunNodeExecutionItem {
  node: WorkflowCanvasNode
  state: {
    nodeId: string
    taskId?: string
  }
}

export interface WorkflowRunNodeDependency {
  dependsOnNodeId: string
  nodeId: string
  workflowRunId: string
}

export interface WorkflowRunSnapshot {
  dependencies: WorkflowRunNodeDependency[]
  edges: WorkflowCanvasEdge[]
  executableNodeIds: string[]
  nodes: WorkflowCanvasNode[]
  run: WorkflowRunRecord
}
