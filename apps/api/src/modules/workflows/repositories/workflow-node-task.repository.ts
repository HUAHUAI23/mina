import type { TaskStatus } from '@mina/contracts/modules/tasks'

export interface WorkflowNodeTaskLink {
  nodeId: string
  taskId: string
  workflowRunId: string
}

export interface WorkflowNodeRuntimeRow {
  latestTaskId: string
  latestTaskCreatedAt: string
  nodeId: string
  status: TaskStatus
  statusUpdatedAt: string
}

export interface WorkflowNodeTaskRuntimeLink {
  accountId: string
  nodeId: string
  taskId: string
  workflowId: string
  workflowRunId: string
  workflowVersion: number
}

export interface WorkflowNodeTaskRepository {
  linkNodeTask(link: WorkflowNodeTaskLink): Promise<void>
  listLatestNodeTasks(workflowId: string): Promise<WorkflowNodeRuntimeRow[]>
  listNodeTaskLinks(workflowId: string, nodeId: string): Promise<WorkflowNodeTaskLink[]>
  listTaskRuntimeLinks(taskIds: readonly string[]): Promise<WorkflowNodeTaskRuntimeLink[]>
}
