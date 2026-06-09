import type { WorkflowPreviewImage } from '@mina/contracts/modules/workflows'
import { and, asc, desc, eq, inArray, isNull, isNotNull } from 'drizzle-orm'

import type { MinaDbClient } from '../../../db/client'
import { mediaObjects, taskResources, tasks, workflowRunNodeTasks, workflowRuns } from '../../../db/schema'
import type { WorkflowPreviewRepository } from '../workflow-preview-hydrator'

export class DrizzleWorkflowPreviewRepository implements WorkflowPreviewRepository {
  constructor(private readonly db: MinaDbClient) {}

  async listLatestImagePreviews(
    accountId: string,
    workflowIds: readonly string[],
  ): Promise<Map<string, WorkflowPreviewImage>> {
    const uniqueWorkflowIds = [...new Set(workflowIds)]
    if (uniqueWorkflowIds.length === 0) {
      return new Map()
    }

    const rows = await this.db
      .selectDistinctOn([workflowRuns.workflowId], {
        mediaObjectId: mediaObjects.id,
        mediaObjectUrl: mediaObjects.url,
        workflowId: workflowRuns.workflowId,
      })
      .from(workflowRuns)
      .innerJoin(workflowRunNodeTasks, eq(workflowRunNodeTasks.workflowRunId, workflowRuns.id))
      .innerJoin(tasks, eq(tasks.id, workflowRunNodeTasks.taskId))
      .innerJoin(taskResources, eq(taskResources.taskId, tasks.id))
      .innerJoin(mediaObjects, eq(mediaObjects.id, taskResources.mediaObjectId))
      .where(
        and(
          eq(workflowRuns.accountId, accountId),
          inArray(workflowRuns.workflowId, uniqueWorkflowIds),
          eq(tasks.accountId, accountId),
          eq(tasks.status, 'succeeded'),
          eq(taskResources.accountId, accountId),
          eq(taskResources.direction, 'output'),
          eq(taskResources.kind, 'image'),
          eq(taskResources.role, 'generated_image'),
          isNotNull(taskResources.mediaObjectId),
          eq(mediaObjects.accountId, accountId),
          eq(mediaObjects.kind, 'image'),
          eq(mediaObjects.status, 'ready'),
          isNull(mediaObjects.deletedAt),
        ),
      )
      .orderBy(asc(workflowRuns.workflowId), desc(mediaObjects.createdAt), desc(taskResources.id))

    const previews = new Map<string, WorkflowPreviewImage>()
    for (const row of rows) {
      previews.set(row.workflowId, {
        kind: 'image',
        mediaObjectId: row.mediaObjectId,
        url: row.mediaObjectUrl,
      })
    }
    return previews
  }
}
