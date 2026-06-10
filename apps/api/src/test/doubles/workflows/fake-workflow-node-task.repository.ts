
import type { Task } from '@mina/contracts/modules/tasks'

import type { TaskRepository } from '../../../modules/tasks/tasks.repository'
import type { WorkflowRunRepository } from '../../../modules/workflows/repositories/workflow-run.repository'
import type {
  WorkflowNodeRuntimeRow,
  WorkflowNodeTaskLink,
  WorkflowNodeTaskRepository,
  WorkflowNodeTaskRuntimeLink,
} from '../../../modules/workflows/repositories/workflow-node-task.repository'

export class FakeWorkflowNodeTaskRepository implements WorkflowNodeTaskRepository {
  readonly #links: WorkflowNodeTaskLink[] = []

  constructor(
    private readonly workflowRunRepository: WorkflowRunRepository,
    private readonly taskRepository: TaskRepository,
  ) {}

  async linkNodeTask(link: WorkflowNodeTaskLink): Promise<void> {
    if (this.#links.some((item) => item.workflowRunId === link.workflowRunId && item.nodeId === link.nodeId)) {
      return
    }
    this.#links.push({ ...link })
  }

  async listLatestNodeTasks(workflowId: string): Promise<WorkflowNodeRuntimeRow[]> {
    const runs = await this.workflowRunRepository.listRuns(workflowId)
    const runIds = new Set(runs.map((run) => run.id))
    const latestByNode = new Map<string, WorkflowNodeRuntimeRow>()
    const hydratedLinks = (
      await Promise.all(
        this.#links
          .filter((candidate) => runIds.has(candidate.workflowRunId))
          .map(async (link) => ({ link, task: await this.taskRepository.findById(link.taskId) })),
      )
    )
      .filter((item): item is { link: WorkflowNodeTaskLink; task: Task } => Boolean(item.task))
      .sort((left, right) =>
        right.task.createdAt.localeCompare(left.task.createdAt) || right.task.id.localeCompare(left.task.id),
      )
    for (const { link, task } of hydratedLinks) {
      if (!latestByNode.has(link.nodeId)) {
        latestByNode.set(link.nodeId, {
          latestTaskCreatedAt: task.createdAt,
          latestTaskId: link.taskId,
          nodeId: link.nodeId,
          status: task.status,
          statusUpdatedAt: task.updatedAt,
        })
      }
    }
    return [...latestByNode.values()]
  }

  async listNodeTaskLinks(workflowId: string, nodeId: string): Promise<WorkflowNodeTaskLink[]> {
    const runs = await this.workflowRunRepository.listRuns(workflowId)
    const runIds = new Set(runs.map((run) => run.id))
    return this.#links.filter((link) => link.nodeId === nodeId && runIds.has(link.workflowRunId)).map((link) => ({ ...link }))
  }

  async listTaskRuntimeLinks(taskIds: readonly string[]): Promise<WorkflowNodeTaskRuntimeLink[]> {
    const taskIdSet = new Set(taskIds)
    const links = this.#links.filter((link) => taskIdSet.has(link.taskId))
    const runs = await this.workflowRunRepository.listRuns()
    const runById = new Map(runs.map((run) => [run.id, run]))
    const result: WorkflowNodeTaskRuntimeLink[] = []
    for (const link of links) {
      const run = runById.get(link.workflowRunId)
      if (!run) {
        continue
      }
      result.push({
        accountId: run.accountId,
        nodeId: link.nodeId,
        taskId: link.taskId,
        workflowId: run.workflowId,
        workflowRunId: run.id,
        workflowVersion: run.workflowVersion,
      })
    }
    return result
  }

  listLinksForTest(): WorkflowNodeTaskLink[] {
    return this.#links.map((link) => ({ ...link }))
  }
}
