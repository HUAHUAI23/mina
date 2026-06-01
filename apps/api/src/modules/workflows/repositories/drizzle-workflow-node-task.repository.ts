import { and, desc, eq, inArray } from 'drizzle-orm'

import type { MinaDbClient } from '../../../db/client'
import { tasks, workflowRunNodeTasks, workflowRuns } from '../../../db/schema'
import type {
  WorkflowNodeRuntimeRow,
  WorkflowNodeTaskLink,
  WorkflowNodeTaskRepository,
  WorkflowNodeTaskRuntimeLink,
} from './workflow-node-task.repository'

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

  async listLatestNodeTasks(workflowId: string): Promise<WorkflowNodeRuntimeRow[]> {
    const rows = await this.db
      .select({
        nodeId: workflowRunNodeTasks.nodeId,
        taskId: workflowRunNodeTasks.taskId,
        taskCreatedAt: tasks.createdAt,
        status: tasks.status,
        taskUpdatedAt: tasks.updatedAt,
      })
      .from(workflowRunNodeTasks)
      .innerJoin(workflowRuns, eq(workflowRunNodeTasks.workflowRunId, workflowRuns.id))
      .innerJoin(tasks, eq(workflowRunNodeTasks.taskId, tasks.id))
      .where(eq(workflowRuns.workflowId, workflowId))
      .orderBy(desc(tasks.createdAt), desc(tasks.id))
    const latestByNode = new Map<string, WorkflowNodeRuntimeRow>()
    for (const row of rows) {
      if (!latestByNode.has(row.nodeId)) {
        latestByNode.set(row.nodeId, {
          latestTaskCreatedAt: row.taskCreatedAt.toISOString(),
          latestTaskId: row.taskId,
          nodeId: row.nodeId,
          status: row.status,
          statusUpdatedAt: row.taskUpdatedAt.toISOString(),
        })
      }
    }
    return [...latestByNode.values()]
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

  async listTaskRuntimeLinks(taskIds: readonly string[]): Promise<WorkflowNodeTaskRuntimeLink[]> {
    if (taskIds.length === 0) {
      return []
    }
    const rows = await this.db
      .select({
        accountId: workflowRuns.accountId,
        nodeId: workflowRunNodeTasks.nodeId,
        taskId: workflowRunNodeTasks.taskId,
        workflowId: workflowRuns.workflowId,
        workflowRunId: workflowRunNodeTasks.workflowRunId,
        workflowVersion: workflowRuns.workflowVersion,
      })
      .from(workflowRunNodeTasks)
      .innerJoin(workflowRuns, eq(workflowRunNodeTasks.workflowRunId, workflowRuns.id))
      .where(inArray(workflowRunNodeTasks.taskId, [...new Set(taskIds)]))
    return rows.map((row) => ({
      accountId: row.accountId,
      nodeId: row.nodeId,
      taskId: row.taskId,
      workflowId: row.workflowId,
      workflowRunId: row.workflowRunId,
      workflowVersion: row.workflowVersion,
    }))
  }
}
