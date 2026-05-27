import type { WorkflowRunNodeState } from '@mina/contracts/modules/workflows'
import { and, eq, notExists, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import type { MinaDbClient } from '../../../db/client'
import {
  workflowRunNodeDependencies,
  workflowRunNodeStates,
  workflowRunNodes,
  workflowRuns,
} from '../../../db/schema'
import {
  workflowRunNodeFromRow,
  workflowRunNodeStateFromRow,
} from './drizzle-workflow-run.repository'
import type {
  ListRunnableNodesInput,
  ListRunningNodesInput,
  MarkNodeFailedInput,
  MarkNodeRunningInput,
  MarkNodeSucceededInput,
  TryMarkNodeStartingInput,
  WorkflowRunNodeStateRepository,
} from './workflow-run-node-state.repository'
import type { WorkflowRunNodeExecutionItem, WorkflowRunStateSummary } from './workflow-types'

const predecessorStates = alias(workflowRunNodeStates, 'predecessor_states')

export class DrizzleWorkflowRunNodeStateRepository implements WorkflowRunNodeStateRepository {
  constructor(private readonly db: MinaDbClient) {}

  async getNodeState(workflowRunId: string, nodeId: string): Promise<WorkflowRunNodeState | undefined> {
    const [row] = await this.db
      .select()
      .from(workflowRunNodeStates)
      .where(and(eq(workflowRunNodeStates.workflowRunId, workflowRunId), eq(workflowRunNodeStates.nodeId, nodeId)))
      .limit(1)
    return row ? workflowRunNodeStateFromRow(row) : undefined
  }

  async listRunnableNodes(input: ListRunnableNodesInput): Promise<WorkflowRunNodeExecutionItem[]> {
    const rows = await this.db
      .select({
        node: workflowRunNodes,
        state: workflowRunNodeStates,
      })
      .from(workflowRunNodeStates)
      .innerJoin(
        workflowRunNodes,
        and(
          eq(workflowRunNodes.workflowRunId, workflowRunNodeStates.workflowRunId),
          eq(workflowRunNodes.nodeId, workflowRunNodeStates.nodeId),
        ),
      )
      .where(
        and(
          eq(workflowRunNodeStates.workflowRunId, input.workflowRunId),
          eq(workflowRunNodeStates.status, 'pending'),
          notExists(
            this.db
              .select({ one: sql`1` })
              .from(workflowRunNodeDependencies)
              .innerJoin(
                predecessorStates,
                and(
                  eq(predecessorStates.workflowRunId, workflowRunNodeDependencies.workflowRunId),
                  eq(predecessorStates.nodeId, workflowRunNodeDependencies.dependsOnNodeId),
                ),
              )
              .where(
                and(
                  eq(workflowRunNodeDependencies.workflowRunId, workflowRunNodeStates.workflowRunId),
                  eq(workflowRunNodeDependencies.nodeId, workflowRunNodeStates.nodeId),
                  sql`${predecessorStates.status} <> 'succeeded'`,
                ),
              ),
          ),
        ),
      )
      .orderBy(workflowRunNodeStates.updatedAt, workflowRunNodeStates.nodeId)
      .limit(input.limit)

    return rows.map((row) => ({
      node: workflowRunNodeFromRow(row.node),
      state: {
        nodeId: row.state.nodeId,
        ...(row.state.taskId ? { taskId: row.state.taskId } : {}),
      },
    }))
  }

  async listRunningNodes(input: ListRunningNodesInput): Promise<WorkflowRunNodeExecutionItem[]> {
    const rows = await this.db
      .select({
        node: workflowRunNodes,
        state: workflowRunNodeStates,
      })
      .from(workflowRunNodeStates)
      .innerJoin(
        workflowRunNodes,
        and(
          eq(workflowRunNodes.workflowRunId, workflowRunNodeStates.workflowRunId),
          eq(workflowRunNodes.nodeId, workflowRunNodeStates.nodeId),
        ),
      )
      .where(and(eq(workflowRunNodeStates.workflowRunId, input.workflowRunId), eq(workflowRunNodeStates.status, 'running')))

    return rows.map((row) => ({
      node: workflowRunNodeFromRow(row.node),
      state: {
        nodeId: row.state.nodeId,
        ...(row.state.taskId ? { taskId: row.state.taskId } : {}),
      },
    }))
  }

  async markNodeFailed(input: MarkNodeFailedInput): Promise<boolean> {
    const predicates = [
      eq(workflowRunNodeStates.workflowRunId, input.workflowRunId),
      eq(workflowRunNodeStates.nodeId, input.nodeId),
      eq(workflowRunNodeStates.status, input.expectedStatus ?? 'running'),
    ]
    if (input.taskId) {
      predicates.push(eq(workflowRunNodeStates.taskId, input.taskId))
    }

    const [row] = await this.db
      .update(workflowRunNodeStates)
      .set({
        status: 'failed',
        error: input.error.message,
        errorCode: input.error.code,
        errorMessageKey: input.error.messageKey ?? null,
        errorParams: input.error.params ?? null,
        errorDebugMessage: input.error.debugMessage ?? null,
        completedAt: new Date(input.completedAt),
        updatedAt: new Date(input.completedAt),
      })
      .where(and(...predicates))
      .returning({ nodeId: workflowRunNodeStates.nodeId })
    await this.touchRun(input.workflowRunId, input.completedAt)
    return row !== undefined
  }

  async markNodeRunning(input: MarkNodeRunningInput): Promise<boolean> {
    const [row] = await this.db
      .update(workflowRunNodeStates)
      .set({
        status: 'running',
        taskId: input.taskId,
        startedAt: new Date(input.startedAt),
        updatedAt: new Date(input.startedAt),
      })
      .where(
        and(
          eq(workflowRunNodeStates.workflowRunId, input.workflowRunId),
          eq(workflowRunNodeStates.nodeId, input.nodeId),
          eq(workflowRunNodeStates.status, 'pending'),
        ),
      )
      .returning({ nodeId: workflowRunNodeStates.nodeId })
    await this.touchRun(input.workflowRunId, input.startedAt)
    return row !== undefined
  }

  async markNodeSucceeded(input: MarkNodeSucceededInput): Promise<boolean> {
    const [row] = await this.db
      .update(workflowRunNodeStates)
      .set({
        status: 'succeeded',
        output: input.output,
        completedAt: new Date(input.completedAt),
        updatedAt: new Date(input.completedAt),
      })
      .where(
        and(
          eq(workflowRunNodeStates.workflowRunId, input.workflowRunId),
          eq(workflowRunNodeStates.nodeId, input.nodeId),
          eq(workflowRunNodeStates.taskId, input.taskId),
          eq(workflowRunNodeStates.status, 'running'),
        ),
      )
      .returning({ nodeId: workflowRunNodeStates.nodeId })
    await this.touchRun(input.workflowRunId, input.completedAt)
    return row !== undefined
  }

  async summarizeRunStates(workflowRunId: string): Promise<WorkflowRunStateSummary> {
    const rows = await this.db
      .select({
        count: sql<number>`cast(count(*) as int)`,
        status: workflowRunNodeStates.status,
      })
      .from(workflowRunNodeStates)
      .where(eq(workflowRunNodeStates.workflowRunId, workflowRunId))
      .groupBy(workflowRunNodeStates.status)

    const summary: WorkflowRunStateSummary = {
      failed: 0,
      pending: 0,
      running: 0,
      skipped: 0,
      succeeded: 0,
      total: 0,
    }
    for (const row of rows) {
      summary[row.status] = Number(row.count)
      summary.total += Number(row.count)
    }
    return summary
  }

  async tryMarkNodeStarting(input: TryMarkNodeStartingInput): Promise<boolean> {
    const result = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ nodeId: workflowRunNodeStates.nodeId })
        .from(workflowRunNodeStates)
        .where(
          and(
            eq(workflowRunNodeStates.workflowRunId, input.workflowRunId),
            eq(workflowRunNodeStates.nodeId, input.nodeId),
            eq(workflowRunNodeStates.status, 'pending'),
          ),
        )
        .limit(1)
        .for('update')
      return row !== undefined
    })
    return result
  }

  private async touchRun(workflowRunId: string, timestamp: string): Promise<void> {
    await this.db.update(workflowRuns).set({ updatedAt: new Date(timestamp) }).where(eq(workflowRuns.id, workflowRunId))
  }
}
