import type {
  NodeMediaViewState,
  Workflow,
  WorkflowRun,
  WorkflowRunNodeState,
} from '@mina/contracts'

export interface WorkflowNodeTaskLink {
  nodeId: string
  taskId: string
  workflowRunId: string
}

export interface WorkflowRepository {
  create(workflow: Workflow): Promise<Workflow>
  createRun(run: WorkflowRun): Promise<WorkflowRun>
  delete(id: string): Promise<boolean>
  findById(id: string): Promise<Workflow | undefined>
  findRunById(id: string): Promise<WorkflowRun | undefined>
  linkNodeTask(link: WorkflowNodeTaskLink): Promise<void>
  list(accountId?: string): Promise<Workflow[]>
  listNodeTaskLinks(workflowId: string, nodeId: string): Promise<WorkflowNodeTaskLink[]>
  listRuns(workflowId?: string): Promise<WorkflowRun[]>
  listRunsByStatus(status: WorkflowRun['status']): Promise<WorkflowRun[]>
  update(workflow: Workflow): Promise<Workflow>
  updateNodeMediaView(workflowId: string, nodeId: string, mediaView: NodeMediaViewState | undefined): Promise<Workflow>
  updateRun(run: WorkflowRun): Promise<WorkflowRun>
  updateRunNodeState(runId: string, nodeId: string, state: WorkflowRunNodeState): Promise<WorkflowRun>
}

const cloneWorkflow = (workflow: Workflow): Workflow => structuredClone(workflow)
const cloneRun = (run: WorkflowRun): WorkflowRun => structuredClone(run)

export class InMemoryWorkflowRepository implements WorkflowRepository {
  readonly #nodeTaskLinks: WorkflowNodeTaskLink[] = []
  readonly #runs = new Map<string, WorkflowRun>()
  readonly #workflows = new Map<string, Workflow>()

  async create(workflow: Workflow): Promise<Workflow> {
    this.#workflows.set(workflow.id, cloneWorkflow(workflow))
    return cloneWorkflow(workflow)
  }

  async createRun(run: WorkflowRun): Promise<WorkflowRun> {
    this.#runs.set(run.id, cloneRun(run))
    return cloneRun(run)
  }

  async delete(id: string): Promise<boolean> {
    return this.#workflows.delete(id)
  }

  async findById(id: string): Promise<Workflow | undefined> {
    const workflow = this.#workflows.get(id)
    return workflow ? cloneWorkflow(workflow) : undefined
  }

  async findRunById(id: string): Promise<WorkflowRun | undefined> {
    const run = this.#runs.get(id)
    return run ? cloneRun(run) : undefined
  }

  async linkNodeTask(link: WorkflowNodeTaskLink): Promise<void> {
    if (
      this.#nodeTaskLinks.some(
        (item) => item.workflowRunId === link.workflowRunId && item.nodeId === link.nodeId,
      )
    ) {
      return
    }

    this.#nodeTaskLinks.push({ ...link })
  }

  async list(accountId?: string): Promise<Workflow[]> {
    return Array.from(this.#workflows.values())
      .filter((workflow) => !accountId || workflow.accountId === accountId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(cloneWorkflow)
  }

  async listNodeTaskLinks(workflowId: string, nodeId: string): Promise<WorkflowNodeTaskLink[]> {
    const runIds = new Set(
      Array.from(this.#runs.values())
        .filter((run) => run.workflowId === workflowId)
        .map((run) => run.id),
    )

    return this.#nodeTaskLinks
      .filter((link) => link.nodeId === nodeId && runIds.has(link.workflowRunId))
      .map((link) => ({ ...link }))
  }

  async listRuns(workflowId?: string): Promise<WorkflowRun[]> {
    return Array.from(this.#runs.values())
      .filter((run) => !workflowId || run.workflowId === workflowId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(cloneRun)
  }

  async listRunsByStatus(status: WorkflowRun['status']): Promise<WorkflowRun[]> {
    return Array.from(this.#runs.values())
      .filter((run) => run.status === status)
      .map(cloneRun)
  }

  async update(workflow: Workflow): Promise<Workflow> {
    this.#workflows.set(workflow.id, cloneWorkflow(workflow))
    return cloneWorkflow(workflow)
  }

  async updateNodeMediaView(
    workflowId: string,
    nodeId: string,
    mediaView: NodeMediaViewState | undefined,
  ): Promise<Workflow> {
    const workflow = this.#workflows.get(workflowId)
    if (!workflow) {
      throw new Error('Workflow not found.')
    }

    const updatedNodes = workflow.nodes.map((node) => {
      if (node.id !== nodeId) {
        return node
      }

      if (node.data.nodeType !== 'image_generation' && node.data.nodeType !== 'video_generation') {
        return node
      }

      return {
        ...node,
        data: {
          ...node.data,
          ...(mediaView ? { mediaView } : {}),
        },
      }
    })

    const updated: Workflow = {
      ...workflow,
      nodes: updatedNodes,
      version: workflow.version + 1,
      updatedAt: new Date().toISOString(),
    }

    this.#workflows.set(workflowId, cloneWorkflow(updated))
    return cloneWorkflow(updated)
  }

  async updateRun(run: WorkflowRun): Promise<WorkflowRun> {
    this.#runs.set(run.id, cloneRun(run))
    return cloneRun(run)
  }

  async updateRunNodeState(runId: string, nodeId: string, state: WorkflowRunNodeState): Promise<WorkflowRun> {
    const run = this.#runs.get(runId)
    if (!run) {
      throw new Error('Workflow run not found.')
    }

    const updated: WorkflowRun = {
      ...run,
      nodeStates: {
        ...run.nodeStates,
        [nodeId]: state,
      },
      updatedAt: new Date().toISOString(),
    }

    this.#runs.set(runId, cloneRun(updated))
    return cloneRun(updated)
  }
}
