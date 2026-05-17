import type { NodeExecutionOutput } from '@mina/contracts/modules/tasks'
import type { WorkflowRunNodeState } from '@mina/contracts/modules/workflows'

import type { WorkflowRunNodeExecutionItem, WorkflowRunStateSummary } from './workflow-types'

export interface ListRunnableNodesInput {
  limit: number
  workflowRunId: string
}

export interface ListRunningNodesInput {
  workflowRunId: string
}

export interface TryMarkNodeStartingInput {
  workflowRunId: string
  nodeId: string
}

export interface MarkNodeRunningInput {
  nodeId: string
  startedAt: string
  taskId: string
  workflowRunId: string
}

export interface MarkNodeSucceededInput {
  completedAt: string
  nodeId: string
  output: NodeExecutionOutput
  taskId: string
  workflowRunId: string
}

export interface MarkNodeFailedInput {
  completedAt: string
  error: string
  nodeId: string
  expectedStatus?: WorkflowRunNodeState['status']
  taskId?: string
  workflowRunId: string
}

export interface WorkflowRunNodeStateRepository {
  getNodeState(workflowRunId: string, nodeId: string): Promise<WorkflowRunNodeState | undefined>
  listRunnableNodes(input: ListRunnableNodesInput): Promise<WorkflowRunNodeExecutionItem[]>
  listRunningNodes(input: ListRunningNodesInput): Promise<WorkflowRunNodeExecutionItem[]>
  markNodeFailed(input: MarkNodeFailedInput): Promise<boolean>
  markNodeRunning(input: MarkNodeRunningInput): Promise<boolean>
  markNodeSucceeded(input: MarkNodeSucceededInput): Promise<boolean>
  summarizeRunStates(workflowRunId: string): Promise<WorkflowRunStateSummary>
  tryMarkNodeStarting(input: TryMarkNodeStartingInput): Promise<boolean>
}
