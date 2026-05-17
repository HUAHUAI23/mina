import type { WorkflowRunRepository } from './workflow-run.repository'
import type { WorkflowNodeTaskLink, WorkflowNodeTaskRepository } from './workflow-node-task.repository'

const cloneLink = (link: WorkflowNodeTaskLink): WorkflowNodeTaskLink => ({ ...link })

export class InMemoryWorkflowNodeTaskRepository implements WorkflowNodeTaskRepository {
  readonly #links: WorkflowNodeTaskLink[] = []

  constructor(private readonly workflowRunRepository: WorkflowRunRepository) {}

  async linkNodeTask(link: WorkflowNodeTaskLink): Promise<void> {
    if (this.#links.some((item) => item.workflowRunId === link.workflowRunId && item.nodeId === link.nodeId)) {
      return
    }
    this.#links.push(cloneLink(link))
  }

  async listNodeTaskLinks(workflowId: string, nodeId: string): Promise<WorkflowNodeTaskLink[]> {
    const runs = await this.workflowRunRepository.listRuns(workflowId)
    const runIds = new Set(runs.map((run) => run.id))
    return this.#links.filter((link) => link.nodeId === nodeId && runIds.has(link.workflowRunId)).map(cloneLink)
  }
}
