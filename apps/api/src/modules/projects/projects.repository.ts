import type { Project, ProjectWorkflow, ProjectWithWorkflows } from '@mina/contracts/modules/projects'
import type { WorkflowSummary } from '@mina/contracts/modules/workflows'

export interface CreateProjectRecordInput {
  accountId: string
  id: string
  name: string
  timestamp: string
}

export interface ProjectRepository {
  addWorkflow(input: {
    accountId: string
    projectId: string
    timestamp: string
    workflowId: string
  }): Promise<ProjectWithWorkflows | undefined>
  create(input: CreateProjectRecordInput & { workflowIds: string[] }): Promise<ProjectWithWorkflows>
  delete(input: { accountId: string; projectId: string; timestamp: string }): Promise<boolean>
  findById(accountId: string, projectId: string): Promise<ProjectWithWorkflows | undefined>
  findWorkflowMembership(accountId: string, workflowId: string): Promise<ProjectWorkflow | undefined>
  listOverview(accountId: string): Promise<{
    projects: ProjectWithWorkflows[]
    ungroupedWorkflows: WorkflowSummary[]
  }>
  removeWorkflow(input: { accountId: string; projectId: string; workflowId: string }): Promise<boolean>
  update(input: { accountId: string; name: string; projectId: string; timestamp: string }): Promise<ProjectWithWorkflows | undefined>
}

export type ProjectRecord = Project
