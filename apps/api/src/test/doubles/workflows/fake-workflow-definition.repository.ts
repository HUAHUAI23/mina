
import type { WorkflowSummary } from '@mina/contracts/modules/workflows'

import type {
  WorkflowDefinitionCreate,
  WorkflowDefinitionRepository,
} from '../../../modules/workflows/repositories/workflow-definition.repository'
import {
  cloneWorkflowSummary,
  workflowSummaryDto,
} from '../../../modules/workflows/repositories/workflow-mappers'

export class FakeWorkflowDefinitionRepository implements WorkflowDefinitionRepository {
  readonly #workflows = new Map<string, WorkflowSummary>()

  async create(input: WorkflowDefinitionCreate): Promise<WorkflowSummary> {
    const workflow = workflowSummaryDto({
      accountId: input.accountId,
      createdAt: input.timestamp,
      id: input.id,
      name: input.name,
      updatedAt: input.timestamp,
      version: input.version,
    })
    this.#workflows.set(workflow.id, cloneWorkflowSummary(workflow))
    return cloneWorkflowSummary(workflow)
  }

  async delete(id: string): Promise<boolean> {
    return this.#workflows.delete(id)
  }

  async findById(id: string): Promise<WorkflowSummary | undefined> {
    const workflow = this.#workflows.get(id)
    return workflow ? cloneWorkflowSummary(workflow) : undefined
  }

  async list(accountId?: string): Promise<WorkflowSummary[]> {
    return [...this.#workflows.values()]
      .filter((workflow) => !accountId || workflow.accountId === accountId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(cloneWorkflowSummary)
  }

  async touch(id: string, timestamp: string, version: number): Promise<WorkflowSummary> {
    const existing = this.#workflows.get(id)
    if (!existing) {
      throw new Error('Workflow not found.')
    }

    const workflow = workflowSummaryDto({
      accountId: existing.accountId,
      createdAt: existing.createdAt,
      id: existing.id,
      name: existing.name,
      updatedAt: timestamp,
      version,
    })
    this.#workflows.set(workflow.id, cloneWorkflowSummary(workflow))
    return cloneWorkflowSummary(workflow)
  }

  async updateName(id: string, name: string, timestamp: string): Promise<WorkflowSummary | undefined> {
    const existing = this.#workflows.get(id)
    if (!existing) {
      return undefined
    }

    const workflow = workflowSummaryDto({
      accountId: existing.accountId,
      createdAt: existing.createdAt,
      id: existing.id,
      name,
      updatedAt: timestamp,
      version: existing.version,
    })
    this.#workflows.set(workflow.id, cloneWorkflowSummary(workflow))
    return cloneWorkflowSummary(workflow)
  }

}
