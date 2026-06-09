import type {
  CreateProjectFromWorkflowsInput,
  CreateProjectInput,
  ProjectWithWorkflows,
  UpdateProjectInput,
} from '@mina/contracts/modules/projects'
import type { WorkflowSummary } from '@mina/contracts/modules/workflows'

import { HttpError } from '../../lib/http/http-error'
import type { WorkflowDefinitionRepository } from '../workflows/repositories/workflow-definition.repository'
import type { WorkflowPreviewHydrator } from '../workflows/workflow-preview-hydrator'
import type { ProjectRepository } from './projects.repository'

const nowIso = (): string => new Date().toISOString()
const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`

export class ProjectsService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly workflows: WorkflowDefinitionRepository,
    private readonly workflowPreviewHydrator: WorkflowPreviewHydrator,
  ) {}

  async addWorkflow(accountId: string, projectId: string, workflowId: string): Promise<ProjectWithWorkflows> {
    await this.requireProject(accountId, projectId)
    await this.requireWorkflow(accountId, workflowId)
    await this.assertWorkflowAvailable(accountId, workflowId)

    try {
      const project = await this.projects.addWorkflow({
        accountId,
        projectId,
        timestamp: nowIso(),
        workflowId,
      })
      if (!project) {
        throw this.projectNotFound()
      }
      return this.hydrateProject(project)
    } catch (error) {
      if (error instanceof HttpError) {
        throw error
      }
      await this.assertWorkflowAvailable(accountId, workflowId)
      throw error
    }
  }

  async createProject(accountId: string, input: CreateProjectInput): Promise<ProjectWithWorkflows> {
    const workflowIds = this.uniqueWorkflowIds(input.workflowIds)
    for (const workflowId of workflowIds) {
      await this.requireWorkflow(accountId, workflowId)
      await this.assertWorkflowAvailable(accountId, workflowId)
    }

    try {
      return this.hydrateProject(await this.projects.create({
        accountId,
        id: createId('project'),
        name: input.name,
        timestamp: nowIso(),
        workflowIds,
      }))
    } catch (error) {
      if (error instanceof HttpError) {
        throw error
      }
      for (const workflowId of workflowIds) {
        await this.assertWorkflowAvailable(accountId, workflowId)
      }
      throw error
    }
  }

  async createProjectFromWorkflows(
    accountId: string,
    input: CreateProjectFromWorkflowsInput,
  ): Promise<ProjectWithWorkflows> {
    if (input.sourceWorkflowId === input.targetWorkflowId) {
      throw new HttpError(422, 'PROJECT_DISTINCT_WORKFLOWS_REQUIRED', {
        fallbackMessage: 'Choose two different canvases to create a project.',
        messageKey: 'api_error_project_distinct_workflows_required',
      })
    }

    const source = await this.requireWorkflow(accountId, input.sourceWorkflowId)
    const target = await this.requireWorkflow(accountId, input.targetWorkflowId)
    await this.assertWorkflowAvailable(accountId, source.id)
    await this.assertWorkflowAvailable(accountId, target.id)

    return this.createProject(accountId, {
      name: input.name?.trim() || this.defaultProjectName(source, target),
      workflowIds: [target.id, source.id],
    })
  }

  async deleteProject(accountId: string, projectId: string): Promise<void> {
    const deleted = await this.projects.delete({ accountId, projectId, timestamp: nowIso() })
    if (!deleted) {
      throw this.projectNotFound()
    }
  }

  async getProject(accountId: string, projectId: string): Promise<ProjectWithWorkflows> {
    return this.hydrateProject(await this.requireProject(accountId, projectId))
  }

  async listOverview(accountId: string) {
    const overview = await this.projects.listOverview(accountId)
    const workflows = [
      ...overview.ungroupedWorkflows,
      ...overview.projects.flatMap((project) => project.workflows),
    ]
    const hydratedWorkflows = await this.workflowPreviewHydrator.hydrate(workflows)
    const workflowsById = new Map(hydratedWorkflows.map((workflow) => [workflow.id, workflow]))

    return {
      projects: overview.projects.map((project) => ({
        ...project,
        workflows: project.workflows.map((workflow) => workflowsById.get(workflow.id) ?? workflow),
      })),
      ungroupedWorkflows: overview.ungroupedWorkflows.map((workflow) => workflowsById.get(workflow.id) ?? workflow),
    }
  }

  async removeWorkflow(accountId: string, projectId: string, workflowId: string): Promise<void> {
    await this.requireProject(accountId, projectId)
    const removed = await this.projects.removeWorkflow({ accountId, projectId, workflowId })
    if (!removed) {
      throw new HttpError(404, 'PROJECT_WORKFLOW_NOT_FOUND', {
        fallbackMessage: 'Canvas is not in this project.',
        messageKey: 'api_error_project_workflow_not_found',
      })
    }
  }

  async updateProject(accountId: string, projectId: string, input: UpdateProjectInput): Promise<ProjectWithWorkflows> {
    const project = await this.projects.update({
      accountId,
      name: input.name,
      projectId,
      timestamp: nowIso(),
    })
    if (!project) {
      throw this.projectNotFound()
    }
    return this.hydrateProject(project)
  }

  private async hydrateProject(project: ProjectWithWorkflows): Promise<ProjectWithWorkflows> {
    return {
      ...project,
      workflows: await this.workflowPreviewHydrator.hydrate(project.workflows),
    }
  }

  private async assertWorkflowAvailable(accountId: string, workflowId: string): Promise<void> {
    const membership = await this.projects.findWorkflowMembership(accountId, workflowId)
    if (membership) {
      throw new HttpError(409, 'WORKFLOW_ALREADY_IN_PROJECT', {
        fallbackMessage: 'Canvas is already in a project.',
        messageKey: 'api_error_workflow_already_in_project',
      })
    }
  }

  private defaultProjectName(source: WorkflowSummary, target: WorkflowSummary): string {
    return `${target.name} + ${source.name}`.slice(0, 120)
  }

  private projectNotFound(): HttpError {
    return new HttpError(404, 'PROJECT_NOT_FOUND', {
      fallbackMessage: 'Project not found.',
      messageKey: 'api_error_project_not_found',
    })
  }

  private async requireProject(accountId: string, projectId: string): Promise<ProjectWithWorkflows> {
    const project = await this.projects.findById(accountId, projectId)
    if (!project) {
      throw this.projectNotFound()
    }
    return project
  }

  private async requireWorkflow(accountId: string, workflowId: string): Promise<WorkflowSummary> {
    const workflow = await this.workflows.findById(workflowId)
    if (!workflow || workflow.accountId !== accountId) {
      throw new HttpError(404, 'WORKFLOW_NOT_FOUND', {
        fallbackMessage: 'Workflow not found.',
        messageKey: 'api_error_workflow_not_found',
      })
    }
    return workflow
  }

  private uniqueWorkflowIds(workflowIds: string[]): string[] {
    return Array.from(new Set(workflowIds))
  }
}
