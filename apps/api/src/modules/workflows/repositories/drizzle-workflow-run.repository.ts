import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import type { WorkflowRun, WorkflowRunNodeState } from '@mina/contracts/modules/workflows'
import type { LocalizedErrorDetails } from '@mina/contracts/schemas/api-error'
import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm'

import type { MinaDbClient } from '../../../db/client'
import {
  workflowRunEdges,
  workflowRunNodeDependencies,
  workflowRunNodeStates,
  workflowRunNodes,
  workflowRuns,
} from '../../../db/schema'
import {
  workflowEdgeFromSnapshotRow,
  workflowEdgeSnapshotRows,
  workflowNodeFromSnapshotRow,
  workflowNodeSnapshotRows,
} from './workflow-snapshot-mappers'
import { toDate, toIso, workflowRunDto } from './workflow-mappers'
import type {
  ClaimWorkflowRunByIdInput,
  ClaimWorkflowRunsInput,
  CreateRunWithSnapshotInput,
  MarkRunFailedInput,
  MarkRunTerminalInput,
  ReleaseWorkflowRunLeaseInput,
  WorkflowRunRepository,
} from './workflow-run.repository'
import type {
  ClaimedWorkflowRun,
  WorkflowRunNodeDependency,
  WorkflowRunRecord,
  WorkflowRunSnapshot,
} from './workflow-types'

type WorkflowRunRow = typeof workflowRuns.$inferSelect
type WorkflowRunNodeRow = typeof workflowRunNodes.$inferSelect
type WorkflowRunEdgeRow = typeof workflowRunEdges.$inferSelect
type WorkflowRunNodeStateRow = typeof workflowRunNodeStates.$inferSelect

const runErrorFromRow = (row: WorkflowRunRow): LocalizedErrorDetails | undefined => {
  if (row.errorCode) {
    return {
      code: row.errorCode,
      message: row.error ?? row.errorDebugMessage ?? 'Workflow run failed.',
      ...(row.errorMessageKey ? { messageKey: row.errorMessageKey } : {}),
      ...(row.errorParams ? { params: row.errorParams } : {}),
      ...(row.errorDebugMessage ? { debugMessage: row.errorDebugMessage } : {}),
    }
  }

  return row.error
    ? {
        code: 'WORKFLOW_RUN_FAILED',
        message: row.error,
        debugMessage: row.error,
      }
    : undefined
}

const runRecordFromRow = (row: WorkflowRunRow): WorkflowRunRecord => {
  const error = runErrorFromRow(row)
  return {
    id: row.id,
    workflowId: row.workflowId,
    accountId: row.accountId,
    workflowVersion: row.workflowVersion,
    runMode: row.runMode,
    selectedNodeId: row.selectedNodeId,
    ...(row.scopeGroupNodeId ? { scopeGroupNodeId: row.scopeGroupNodeId } : {}),
    status: row.status,
    ...(error ? { error } : {}),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    ...(row.startedAt ? { startedAt: toIso(row.startedAt) } : {}),
    ...(row.completedAt ? { completedAt: toIso(row.completedAt) } : {}),
  }
}

export const workflowRunNodeFromRow = (row: WorkflowRunNodeRow): WorkflowCanvasNode =>
  workflowNodeFromSnapshotRow(row)

export const workflowRunEdgeFromRow = (row: WorkflowRunEdgeRow): WorkflowCanvasEdge =>
  workflowEdgeFromSnapshotRow(row)

export const workflowRunNodeStateFromRow = (row: WorkflowRunNodeStateRow): WorkflowRunNodeState => ({
  status: row.status,
  ...(row.taskId ? { taskId: row.taskId } : {}),
  ...(row.output ? { output: row.output } : {}),
  ...(row.errorCode
    ? {
        error: {
          code: row.errorCode,
          message: row.error ?? row.errorDebugMessage ?? 'Workflow node execution failed.',
          ...(row.errorMessageKey ? { messageKey: row.errorMessageKey } : {}),
          ...(row.errorParams ? { params: row.errorParams } : {}),
          ...(row.errorDebugMessage ? { debugMessage: row.errorDebugMessage } : {}),
        },
      }
    : row.error
      ? { error: { code: 'WORKFLOW_NODE_FAILED', message: row.error, debugMessage: row.error } }
      : {}),
  ...(row.startedAt ? { startedAt: toIso(row.startedAt) } : {}),
  ...(row.completedAt ? { completedAt: toIso(row.completedAt) } : {}),
})

const dependencyRows = (
  dependencies: WorkflowRunNodeDependency[],
): Array<typeof workflowRunNodeDependencies.$inferInsert> =>
  dependencies.map((dependency) => ({
    workflowRunId: dependency.workflowRunId,
    nodeId: dependency.nodeId,
    dependsOnNodeId: dependency.dependsOnNodeId,
  }))

const nodeSnapshotRows = (
  workflowRunId: string,
  nodes: WorkflowCanvasNode[],
  timestamp: string,
): Array<typeof workflowRunNodes.$inferInsert> =>
  workflowNodeSnapshotRows(workflowRunId, nodes, timestamp)

const edgeSnapshotRows = (
  workflowRunId: string,
  edges: WorkflowCanvasEdge[],
  timestamp: string,
): Array<typeof workflowRunEdges.$inferInsert> =>
  workflowEdgeSnapshotRows(workflowRunId, edges, timestamp)

export class DrizzleWorkflowRunRepository implements WorkflowRunRepository {
  constructor(private readonly db: MinaDbClient) {}

  async cancelRun(runId: string, timestamp: string): Promise<WorkflowRunRecord | undefined> {
    const [row] = await this.db
      .update(workflowRuns)
      .set({
        status: 'cancelled',
        completedAt: new Date(timestamp),
        updatedAt: new Date(timestamp),
      })
      .where(and(eq(workflowRuns.id, runId), inArray(workflowRuns.status, ['queued', 'running'])))
      .returning()
    return row ? runRecordFromRow(row) : undefined
  }

  async claimRunById(input: ClaimWorkflowRunByIdInput): Promise<ClaimedWorkflowRun | undefined> {
    const now = new Date()
    const leaseUntil = new Date(now.getTime() + input.leaseSeconds * 1000)
    const leaseToken = `lease_${crypto.randomUUID()}`
    const [claimed] = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(workflowRuns)
        .where(
          and(
            eq(workflowRuns.id, input.runId),
            eq(workflowRuns.status, 'running'),
            or(isNull(workflowRuns.leaseUntil), lte(workflowRuns.leaseUntil, now)),
          ),
        )
        .limit(1)
        .for('update', { skipLocked: true })

      if (!row) {
        return []
      }

      return tx
        .update(workflowRuns)
        .set({
          leasedBy: input.instanceId,
          leaseToken,
          leaseUntil,
          updatedAt: now,
        })
        .where(eq(workflowRuns.id, input.runId))
        .returning()
    })

    return claimed
      ? {
          ...runRecordFromRow(claimed),
          leaseToken,
        }
      : undefined
  }

  async claimRunningRuns(input: ClaimWorkflowRunsInput): Promise<ClaimedWorkflowRun[]> {
    const now = new Date()
    const leaseUntil = new Date(now.getTime() + input.leaseSeconds * 1000)
    const claimed = await this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(workflowRuns)
        .where(
          and(
            eq(workflowRuns.status, 'running'),
            or(isNull(workflowRuns.nextReconcileAt), lte(workflowRuns.nextReconcileAt, now)),
            or(isNull(workflowRuns.leaseUntil), lte(workflowRuns.leaseUntil, now)),
          ),
        )
        .orderBy(asc(workflowRuns.updatedAt))
        .limit(input.limit)
        .for('update', { skipLocked: true })

      if (rows.length === 0) {
        return []
      }

      const tokens = new Map(rows.map((row) => [row.id, `lease_${crypto.randomUUID()}`]))
      for (const row of rows) {
        await tx
          .update(workflowRuns)
          .set({
            leasedBy: input.instanceId,
            leaseToken: tokens.get(row.id),
            leaseUntil,
            updatedAt: now,
          })
          .where(eq(workflowRuns.id, row.id))
      }

      return rows.map((row) => ({
        ...row,
        updatedAt: now,
        leasedBy: input.instanceId,
        leaseToken: tokens.get(row.id) ?? '',
        leaseUntil,
      }))
    })

    return claimed.map((row) => ({
      ...runRecordFromRow(row),
      leaseToken: row.leaseToken ?? '',
    }))
  }

  async createRunWithSnapshot(input: CreateRunWithSnapshotInput): Promise<WorkflowRun> {
    await this.db.transaction(async (tx) => {
      await tx.insert(workflowRuns).values({
        id: input.run.id,
        workflowId: input.run.workflowId,
        accountId: input.run.accountId,
        workflowVersion: input.run.workflowVersion,
        runMode: input.run.runMode,
        selectedNodeId: input.run.selectedNodeId,
        scopeGroupNodeId: input.run.scopeGroupNodeId ?? null,
        status: input.run.status,
        error: input.run.error?.message ?? null,
        errorCode: input.run.error?.code ?? null,
        errorMessageKey: input.run.error?.messageKey ?? null,
        errorParams: input.run.error?.params ?? null,
        errorDebugMessage: input.run.error?.debugMessage ?? null,
        nextReconcileAt: null,
        leaseUntil: null,
        leasedBy: null,
        leaseToken: null,
        startedAt: toDate(input.run.startedAt),
        completedAt: toDate(input.run.completedAt),
        createdAt: new Date(input.run.createdAt),
        updatedAt: new Date(input.run.updatedAt),
      })

      const nodes = nodeSnapshotRows(input.run.id, input.snapshotNodes, input.run.createdAt)
      if (nodes.length > 0) {
        await tx.insert(workflowRunNodes).values(nodes)
      }
      const edges = edgeSnapshotRows(input.run.id, input.snapshotEdges, input.run.createdAt)
      if (edges.length > 0) {
        await tx.insert(workflowRunEdges).values(edges)
      }
      if (input.executableNodeIds.length > 0) {
        await tx.insert(workflowRunNodeStates).values(
          input.executableNodeIds.map((nodeId) => ({
            workflowRunId: input.run.id,
            nodeId,
            status: 'pending' as const,
            taskId: null,
            output: null,
            error: null,
            errorCode: null,
            errorMessageKey: null,
            errorParams: null,
            errorDebugMessage: null,
            startedAt: null,
            completedAt: null,
            updatedAt: new Date(input.run.createdAt),
          })),
        )
      }
      const dependencies = dependencyRows(input.dependencies)
      if (dependencies.length > 0) {
        await tx.insert(workflowRunNodeDependencies).values(dependencies)
      }
    })

    const run = await this.findRunById(input.run.id)
    if (!run) {
      throw new Error('Workflow run was not persisted.')
    }
    return run
  }

  async findRunById(id: string): Promise<WorkflowRun | undefined> {
    const snapshot = await this.getSnapshot(id)
    if (!snapshot) {
      return undefined
    }
    const states = await this.readNodeStates(id)
    return workflowRunDto({
      run: snapshot.run,
      snapshotNodes: snapshot.nodes,
      snapshotEdges: snapshot.edges,
      nodeStates: states,
    })
  }

  async getSnapshot(runId: string): Promise<WorkflowRunSnapshot | undefined> {
    const [runRow] = await this.db.select().from(workflowRuns).where(eq(workflowRuns.id, runId)).limit(1)
    if (!runRow) {
      return undefined
    }
    const [nodes, edges, dependencies] = await Promise.all([
      this.db
        .select()
        .from(workflowRunNodes)
        .where(eq(workflowRunNodes.workflowRunId, runId))
        .orderBy(asc(workflowRunNodes.sortOrder)),
      this.db
        .select()
        .from(workflowRunEdges)
        .where(eq(workflowRunEdges.workflowRunId, runId))
        .orderBy(asc(workflowRunEdges.sortOrder)),
      this.db.select().from(workflowRunNodeDependencies).where(eq(workflowRunNodeDependencies.workflowRunId, runId)),
    ])
    const stateRows = await this.db
      .select({ nodeId: workflowRunNodeStates.nodeId })
      .from(workflowRunNodeStates)
      .where(eq(workflowRunNodeStates.workflowRunId, runId))

    return {
      run: runRecordFromRow(runRow),
      nodes: nodes.map(workflowRunNodeFromRow),
      edges: edges.map(workflowRunEdgeFromRow),
      executableNodeIds: stateRows.map((row) => row.nodeId),
      dependencies: dependencies.map((row) => ({
        workflowRunId: row.workflowRunId,
        nodeId: row.nodeId,
        dependsOnNodeId: row.dependsOnNodeId,
      })),
    }
  }

  async listRuns(workflowId?: string): Promise<WorkflowRun[]> {
    const rows = workflowId
      ? await this.db
          .select()
          .from(workflowRuns)
          .where(eq(workflowRuns.workflowId, workflowId))
          .orderBy(desc(workflowRuns.createdAt))
      : await this.db.select().from(workflowRuns).orderBy(desc(workflowRuns.createdAt))

    const runs: WorkflowRun[] = []
    for (const row of rows) {
      const run = await this.findRunById(row.id)
      if (run) {
        runs.push(run)
      }
    }
    return runs
  }

  async markRunCancelled(input: MarkRunTerminalInput): Promise<WorkflowRunRecord | undefined> {
    return this.markTerminal(input, 'cancelled')
  }

  async markRunFailed(input: MarkRunFailedInput): Promise<WorkflowRunRecord | undefined> {
    return this.markTerminal(input, 'failed', input.error)
  }

  async markRunSucceeded(input: MarkRunTerminalInput): Promise<WorkflowRunRecord | undefined> {
    return this.markTerminal(input, 'succeeded')
  }

  async releaseRunLease(input: ReleaseWorkflowRunLeaseInput): Promise<void> {
    await this.db
      .update(workflowRuns)
      .set({
        leasedBy: null,
        leaseToken: null,
        leaseUntil: null,
        nextReconcileAt: toDate(input.nextReconcileAt),
        updatedAt: new Date(),
      })
      .where(and(eq(workflowRuns.id, input.runId), eq(workflowRuns.leaseToken, input.leaseToken)))
  }

  private async markTerminal(
    input: MarkRunTerminalInput,
    status: WorkflowRunRecord['status'],
    error?: LocalizedErrorDetails,
  ): Promise<WorkflowRunRecord | undefined> {
    const leasePredicate = input.leaseToken ? eq(workflowRuns.leaseToken, input.leaseToken) : sql`true`
    const [row] = await this.db
      .update(workflowRuns)
      .set({
        status,
        error: error?.message ?? null,
        errorCode: error?.code ?? null,
        errorMessageKey: error?.messageKey ?? null,
        errorParams: error?.params ?? null,
        errorDebugMessage: error?.debugMessage ?? null,
        completedAt: new Date(input.timestamp),
        updatedAt: new Date(input.timestamp),
      })
      .where(and(eq(workflowRuns.id, input.runId), eq(workflowRuns.status, 'running'), leasePredicate))
      .returning()
    return row ? runRecordFromRow(row) : undefined
  }

  private async readNodeStates(workflowRunId: string): Promise<Record<string, WorkflowRunNodeState>> {
    const rows = await this.db
      .select()
      .from(workflowRunNodeStates)
      .where(eq(workflowRunNodeStates.workflowRunId, workflowRunId))
    return Object.fromEntries(rows.map((row) => [row.nodeId, workflowRunNodeStateFromRow(row)]))
  }
}
