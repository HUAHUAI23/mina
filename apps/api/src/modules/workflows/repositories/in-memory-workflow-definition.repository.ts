import type { Workflow } from '@mina/contracts/modules/workflows'

import {
  cloneWorkflow,
  normalizeWorkflowEdge,
  normalizeWorkflowNode,
  workflowDto,
} from './workflow-mappers'
import type {
  ReplaceWorkflowDefinitionInput,
  UpdateNodeMediaViewPersistenceInput,
  WorkflowDefinitionCreate,
  WorkflowDefinitionRepository,
} from './workflow-definition.repository'

export class InMemoryWorkflowDefinitionRepository implements WorkflowDefinitionRepository {
  readonly #workflows = new Map<string, Workflow>()

  async create(input: WorkflowDefinitionCreate): Promise<Workflow> {
    const workflow = workflowDto({
      id: input.id,
      accountId: input.accountId,
      name: input.name,
      version: input.version,
      nodes: input.nodes,
      edges: input.edges,
      createdAt: input.timestamp,
      updatedAt: input.timestamp,
    })
    this.#workflows.set(workflow.id, cloneWorkflow(workflow))
    return cloneWorkflow(workflow)
  }

  async delete(id: string): Promise<boolean> {
    return this.#workflows.delete(id)
  }

  async findById(id: string): Promise<Workflow | undefined> {
    const workflow = this.#workflows.get(id)
    return workflow ? cloneWorkflow(workflow) : undefined
  }

  async list(accountId?: string): Promise<Workflow[]> {
    return Array.from(this.#workflows.values())
      .filter((workflow) => !accountId || workflow.accountId === accountId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(cloneWorkflow)
  }

  async replaceDefinition(input: ReplaceWorkflowDefinitionInput): Promise<Workflow> {
    const existing = this.#workflows.get(input.id)
    if (!existing) {
      throw new Error('Workflow not found.')
    }

    const workflow = workflowDto({
      id: existing.id,
      accountId: existing.accountId,
      name: input.name,
      version: input.version,
      nodes: input.nodes,
      edges: input.edges,
      createdAt: existing.createdAt,
      updatedAt: input.timestamp,
    })
    this.#workflows.set(workflow.id, cloneWorkflow(workflow))
    return cloneWorkflow(workflow)
  }

  async updateNodeMediaView(input: UpdateNodeMediaViewPersistenceInput): Promise<Workflow> {
    const workflow = this.#workflows.get(input.workflowId)
    if (!workflow) {
      throw new Error('Workflow not found.')
    }

    const nodes = workflow.nodes.map((node) => {
      if (node.id !== input.nodeId) {
        return normalizeWorkflowNode(node)
      }
      if (node.data.nodeType !== 'image_generation' && node.data.nodeType !== 'video_generation') {
        return normalizeWorkflowNode(node)
      }

      const { mediaView: _mediaView, ...dataWithoutMediaView } = node.data
      return normalizeWorkflowNode({
        ...node,
        data: input.mediaView
          ? {
              ...node.data,
              mediaView: input.mediaView,
            }
          : dataWithoutMediaView,
      })
    })

    const updated = workflowDto({
      ...workflow,
      nodes,
      edges: workflow.edges.map(normalizeWorkflowEdge),
      version: workflow.version + 1,
      updatedAt: input.timestamp,
    })
    this.#workflows.set(workflow.id, cloneWorkflow(updated))
    return cloneWorkflow(updated)
  }
}
