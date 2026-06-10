
import type { WorkflowPreviewImage } from '@mina/contracts/modules/workflows'

import type { MediaObjectService } from '../../../modules/media/media-object.service'
import type { WorkflowRunRepository } from '../../../modules/workflows/repositories/workflow-run.repository'
import type { WorkflowPreviewRepository } from '../../../modules/workflows/workflow-preview-hydrator'
import type { FakeTaskRepository } from '../tasks/fake-task.repository'
import type { FakeWorkflowNodeTaskRepository } from './fake-workflow-node-task.repository'

export class FakeWorkflowPreviewRepository implements WorkflowPreviewRepository {
  constructor(
    private readonly workflowRunRepository: WorkflowRunRepository,
    private readonly nodeTasks: FakeWorkflowNodeTaskRepository,
    private readonly taskRepository: FakeTaskRepository,
    private readonly mediaObjectService: MediaObjectService,
  ) {}

  async listLatestImagePreviews(accountId: string, workflowIds: readonly string[]): Promise<Map<string, WorkflowPreviewImage>> {
    const workflowIdSet = new Set(workflowIds)
    const runs = (await this.workflowRunRepository.listRuns()).filter(
      (run) => run.accountId === accountId && workflowIdSet.has(run.workflowId),
    )
    const runById = new Map(runs.map((run) => [run.id, run]))
    const taskIdsByWorkflow = new Map<string, Set<string>>()
    for (const link of this.nodeTasks.listLinksForTest()) {
      const run = runById.get(link.workflowRunId)
      if (!run) {
        continue
      }
      const taskIds = taskIdsByWorkflow.get(run.workflowId) ?? new Set<string>()
      taskIds.add(link.taskId)
      taskIdsByWorkflow.set(run.workflowId, taskIds)
    }

    const candidates = await Promise.all(
      this.taskRepository
        .listAllResourcesForTest()
        .filter(
          (resource) =>
            resource.accountId === accountId &&
            resource.direction === 'output' &&
            resource.kind === 'image' &&
            resource.role === 'generated_image' &&
            resource.mediaObjectId,
        )
        .map(async (resource) => {
          const workflowId = [...taskIdsByWorkflow.entries()].find(([, taskIds]) => taskIds.has(resource.taskId))?.[0]
          if (!workflowId || !resource.mediaObjectId) {
            return undefined
          }
          const task = await this.taskRepository.findById(resource.taskId)
          if (!task || task.status !== 'succeeded') {
            return undefined
          }
          const mediaObject = await this.mediaObjectService.getReadyMediaObject(accountId, resource.mediaObjectId).catch(() => undefined)
          if (!mediaObject || mediaObject.kind !== 'image') {
            return undefined
          }
          return {
            createdAt: task.createdAt,
            preview: {
              kind: 'image' as const,
              mediaObjectId: mediaObject.id,
              url: mediaObject.url,
            },
            resourceId: resource.id,
            workflowId,
          }
        }),
    )

    const previews = new Map<string, WorkflowPreviewImage>()
    for (const candidate of candidates
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.resourceId.localeCompare(left.resourceId))) {
      if (!previews.has(candidate.workflowId)) {
        previews.set(candidate.workflowId, candidate.preview)
      }
    }
    return previews
  }
}
