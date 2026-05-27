import type { Project, ProjectWorkflow, ProjectWithWorkflows } from '@mina/contracts/modules/projects'
import { ProjectSchema, ProjectWithWorkflowsSchema, ProjectWorkflowSchema } from '@mina/contracts/modules/projects'
import type { WorkflowSummary } from '@mina/contracts/modules/workflows'

export const projectDto = (input: {
  accountId: string
  createdAt: string
  id: string
  name: string
  updatedAt: string
}): Project =>
  ProjectSchema.parse({
    id: input.id,
    accountId: input.accountId,
    name: input.name,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  })

export const projectWorkflowDto = (input: {
  createdAt: string
  projectId: string
  sortOrder: number
  updatedAt: string
  workflowId: string
}): ProjectWorkflow =>
  ProjectWorkflowSchema.parse({
    projectId: input.projectId,
    workflowId: input.workflowId,
    sortOrder: input.sortOrder,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  })

export const projectWithWorkflowsDto = (project: Project, workflows: WorkflowSummary[]): ProjectWithWorkflows =>
  ProjectWithWorkflowsSchema.parse({
    ...project,
    workflows,
  })

export const cloneProjectWithWorkflows = (project: ProjectWithWorkflows): ProjectWithWorkflows =>
  structuredClone(project)
