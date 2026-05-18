import { and, eq } from 'drizzle-orm'

import type { MinaDbClient } from '../../../db/client'
import { workflowRunNodeTasks, workflowRuns } from '../../../db/schema'
import type { WorkflowNodeTaskLink, WorkflowNodeTaskRepository } from './workflow-node-task.repository'

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`

export class DrizzleWorkflowNodeTaskRepository implements WorkflowNodeTaskRepository {
  constructor(private readonly db: MinaDbClient) {}

  async linkNodeTask(link: WorkflowNodeTaskLink): Promise<void> {
    await this.db
      .insert(workflowRunNodeTasks)
      .values({
        id: createId('workflow_run_node_task'),
        workflowRunId: link.workflowRunId,
        nodeId: link.nodeId,
        taskId: link.taskId,
      })
      .onConflictDoNothing({
        target: [workflowRunNodeTasks.workflowRunId, workflowRunNodeTasks.nodeId],
      })
  }

  async listNodeTaskLinks(workflowId: string, nodeId: string): Promise<WorkflowNodeTaskLink[]> {
    return this.db
      .select({
        nodeId: workflowRunNodeTasks.nodeId,
        taskId: workflowRunNodeTasks.taskId,
        workflowRunId: workflowRunNodeTasks.workflowRunId,
      })
      .from(workflowRunNodeTasks)
      .innerJoin(workflowRuns, eq(workflowRunNodeTasks.workflowRunId, workflowRuns.id))
      .where(and(eq(workflowRuns.workflowId, workflowId), eq(workflowRunNodeTasks.nodeId, nodeId)))
  }
}
