export interface WorkflowNodeTaskLink {
  nodeId: string
  taskId: string
  workflowRunId: string
}

export interface WorkflowNodeTaskRepository {
  linkNodeTask(link: WorkflowNodeTaskLink): Promise<void>
  listNodeTaskLinks(workflowId: string, nodeId: string): Promise<WorkflowNodeTaskLink[]>
}
