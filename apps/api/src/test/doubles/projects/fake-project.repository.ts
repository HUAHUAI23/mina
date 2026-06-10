
import type { Project, ProjectWorkflow, ProjectWithWorkflows } from '@mina/contracts/modules/projects'
import type { WorkflowSummary } from '@mina/contracts/modules/workflows'

import {
  cloneProjectWithWorkflows,
  projectDto,
  projectWithWorkflowsDto,
  projectWorkflowDto,
} from '../../../modules/projects/project-mappers'
import type { CreateProjectRecordInput, ProjectRepository } from '../../../modules/projects/projects.repository'
import type { WorkflowDefinitionRepository } from '../../../modules/workflows/repositories/workflow-definition.repository'
import { cloneWorkflowSummary } from '../../../modules/workflows/repositories/workflow-mappers'
import { clone } from '../shared/clone'

export class FakeProjectRepository implements ProjectRepository {
  readonly #memberships = new Map<string, ProjectWorkflow>()
  readonly #projects = new Map<string, Project>()

  constructor(private readonly workflowDefinitions: WorkflowDefinitionRepository) {}

  async addWorkflow(input: {
    accountId: string
    projectId: string
    timestamp: string
    workflowId: string
  }): Promise<ProjectWithWorkflows | undefined> {
    const project = this.#projects.get(input.projectId)
    const workflow = await this.workflowDefinitions.findById(input.workflowId)
    if (!project || project.accountId !== input.accountId || !workflow || workflow.accountId !== input.accountId) {
      return undefined
    }
    if (this.workflowMembership(input.workflowId)) {
      throw new Error('Canvas is already in a project.')
    }

    const membership = projectWorkflowDto({
      createdAt: input.timestamp,
      projectId: input.projectId,
      sortOrder: this.nextSortOrder(input.projectId),
      updatedAt: input.timestamp,
      workflowId: input.workflowId,
    })
    this.#memberships.set(this.membershipKey(input.projectId, input.workflowId), membership)
    this.#projects.set(project.id, {
      ...project,
      updatedAt: input.timestamp,
    })
    return this.findById(input.accountId, input.projectId)
  }

  async create(input: CreateProjectRecordInput & { workflowIds: string[] }): Promise<ProjectWithWorkflows> {
    for (const workflowId of input.workflowIds) {
      const workflow = await this.workflowDefinitions.findById(workflowId)
      if (!workflow || workflow.accountId !== input.accountId) {
        throw new Error('One or more workflows were not found.')
      }
      if (this.workflowMembership(workflowId)) {
        throw new Error('Canvas is already in a project.')
      }
    }

    const project = projectDto({
      accountId: input.accountId,
      createdAt: input.timestamp,
      id: input.id,
      name: input.name,
      updatedAt: input.timestamp,
    })
    this.#projects.set(project.id, project)
    for (const [index, workflowId] of input.workflowIds.entries()) {
      const membership = projectWorkflowDto({
        createdAt: input.timestamp,
        projectId: project.id,
        sortOrder: index,
        updatedAt: input.timestamp,
        workflowId,
      })
      this.#memberships.set(this.membershipKey(project.id, workflowId), membership)
    }

    const created = await this.findById(input.accountId, project.id)
    if (!created) {
      throw new Error('Project was not loaded after creation.')
    }
    return created
  }

  async delete(input: { accountId: string; projectId: string; timestamp: string }): Promise<boolean> {
    const project = this.#projects.get(input.projectId)
    if (!project || project.accountId !== input.accountId) {
      return false
    }
    this.#projects.delete(input.projectId)
    for (const [key, membership] of this.#memberships.entries()) {
      if (membership.projectId === input.projectId) {
        this.#memberships.delete(key)
      }
    }
    return true
  }

  async findById(accountId: string, projectId: string): Promise<ProjectWithWorkflows | undefined> {
    const project = this.#projects.get(projectId)
    if (!project || project.accountId !== accountId) {
      return undefined
    }

    return cloneProjectWithWorkflows(projectWithWorkflowsDto(project, await this.workflowsForProject(projectId)))
  }

  async findWorkflowMembership(accountId: string, workflowId: string): Promise<ProjectWorkflow | undefined> {
    const membership = this.workflowMembership(workflowId)
    if (!membership) {
      return undefined
    }
    const project = this.#projects.get(membership.projectId)
    const workflow = await this.workflowDefinitions.findById(workflowId)
    return project?.accountId === accountId && workflow?.accountId === accountId ? clone(membership) : undefined
  }

  async listOverview(accountId: string): Promise<{
    projects: ProjectWithWorkflows[]
    ungroupedWorkflows: WorkflowSummary[]
  }> {
    const projects = await Promise.all(
      [...this.#projects.values()]
        .filter((project) => project.accountId === accountId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map((project) => this.findById(accountId, project.id)),
    )
    const memberWorkflowIds = new Set(
      [...this.#memberships.values()]
        .filter((membership) => this.#projects.get(membership.projectId)?.accountId === accountId)
        .map((membership) => membership.workflowId),
    )
    const ungroupedWorkflows = (await this.workflowDefinitions.list(accountId))
      .filter((workflow) => !memberWorkflowIds.has(workflow.id))
      .map(cloneWorkflowSummary)

    return {
      projects: projects.filter((project: ProjectWithWorkflows | undefined): project is ProjectWithWorkflows => Boolean(project)),
      ungroupedWorkflows,
    }
  }

  async removeWorkflow(input: { accountId: string; projectId: string; workflowId: string }): Promise<boolean> {
    const project = this.#projects.get(input.projectId)
    if (!project || project.accountId !== input.accountId) {
      return false
    }
    return this.#memberships.delete(this.membershipKey(input.projectId, input.workflowId))
  }

  async update(input: {
    accountId: string
    name: string
    projectId: string
    timestamp: string
  }): Promise<ProjectWithWorkflows | undefined> {
    const project = this.#projects.get(input.projectId)
    if (!project || project.accountId !== input.accountId) {
      return undefined
    }
    this.#projects.set(project.id, {
      ...project,
      name: input.name,
      updatedAt: input.timestamp,
    })
    return this.findById(input.accountId, input.projectId)
  }

  private membershipKey(projectId: string, workflowId: string): string {
    return `${projectId}:${workflowId}`
  }

  private nextSortOrder(projectId: string): number {
    const sortOrders = [...this.#memberships.values()]
      .filter((membership) => membership.projectId === projectId)
      .map((membership) => membership.sortOrder)
    return sortOrders.length > 0 ? Math.max(...sortOrders) + 1 : 0
  }

  private async workflowsForProject(projectId: string): Promise<WorkflowSummary[]> {
    const workflows = await Promise.all(
      [...this.#memberships.values()]
        .filter((membership) => membership.projectId === projectId)
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((membership) => this.workflowDefinitions.findById(membership.workflowId)),
    )
    return workflows.filter((workflow): workflow is WorkflowSummary => Boolean(workflow)).map(cloneWorkflowSummary)
  }

  private workflowMembership(workflowId: string): ProjectWorkflow | undefined {
    return [...this.#memberships.values()].find((membership) => membership.workflowId === workflowId)
  }
}
