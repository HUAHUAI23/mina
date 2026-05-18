import type { WorkflowRunNodeDependency } from './workflow-types'

export interface WorkflowRunDependencyRepository {
  listDependencies(workflowRunId: string): Promise<WorkflowRunNodeDependency[]>
}
