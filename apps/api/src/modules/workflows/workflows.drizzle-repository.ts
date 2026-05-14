import type { NodeMediaViewState } from '@mina/contracts/modules/canvas'
import type { Workflow, WorkflowRun, WorkflowRunNodeState } from '@mina/contracts/modules/workflows'
import { WorkflowRunSchema, WorkflowSchema } from '@mina/contracts/modules/workflows'
import { and, desc, eq, isNull } from 'drizzle-orm'

import type { MinaDbClient } from '../../db/client'
import { workflowRunNodeTasks, workflowRuns, workflows } from '../../db/schema'
import type { WorkflowNodeTaskLink, WorkflowRepository } from './workflows.repository'

type WorkflowRow = typeof workflows.$inferSelect
type WorkflowInsert = typeof workflows.$inferInsert
type WorkflowRunRow = typeof workflowRuns.$inferSelect
type WorkflowRunInsert = typeof workflowRuns.$inferInsert

const nowIso = (): string => new Date().toISOString()

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`

const toIso = (value: Date): string => value.toISOString()

const toDate = (value: string | undefined): Date | null => (value ? new Date(value) : null)

const workflowFromRow = (row: WorkflowRow): Workflow =>
  WorkflowSchema.parse({
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    version: row.version,
    nodes: row.nodes,
    edges: row.edges,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  })

const workflowInsertFromWorkflow = (workflow: Workflow): WorkflowInsert => ({
  id: workflow.id,
  accountId: workflow.accountId,
  name: workflow.name,
  version: workflow.version,
  nodes: workflow.nodes,
  edges: workflow.edges,
  deletedAt: null,
  createdAt: new Date(workflow.createdAt),
  updatedAt: new Date(workflow.updatedAt),
})

const workflowUpdateFromWorkflow = (workflow: Workflow): Partial<WorkflowInsert> => ({
  accountId: workflow.accountId,
  name: workflow.name,
  version: workflow.version,
  nodes: workflow.nodes,
  edges: workflow.edges,
  updatedAt: new Date(workflow.updatedAt),
})

const workflowRunFromRow = (row: WorkflowRunRow): WorkflowRun =>
  WorkflowRunSchema.parse({
    id: row.id,
    workflowId: row.workflowId,
    accountId: row.accountId,
    workflowVersion: row.workflowVersion,
    runMode: row.runMode,
    selectedNodeId: row.selectedNodeId,
    ...(row.scopeGroupNodeId ? { scopeGroupNodeId: row.scopeGroupNodeId } : {}),
    snapshotNodes: row.snapshotNodes,
    snapshotEdges: row.snapshotEdges,
    nodeStates: row.nodeStates,
    status: row.status,
    ...(row.error ? { error: row.error } : {}),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    ...(row.startedAt ? { startedAt: toIso(row.startedAt) } : {}),
    ...(row.completedAt ? { completedAt: toIso(row.completedAt) } : {}),
  })

const workflowRunInsertFromRun = (run: WorkflowRun): WorkflowRunInsert => ({
  id: run.id,
  workflowId: run.workflowId,
  accountId: run.accountId,
  workflowVersion: run.workflowVersion,
  runMode: run.runMode,
  selectedNodeId: run.selectedNodeId,
  scopeGroupNodeId: run.scopeGroupNodeId ?? null,
  snapshotNodes: run.snapshotNodes,
  snapshotEdges: run.snapshotEdges,
  nodeStates: run.nodeStates,
  status: run.status,
  error: run.error ?? null,
  startedAt: toDate(run.startedAt),
  completedAt: toDate(run.completedAt),
  createdAt: new Date(run.createdAt),
  updatedAt: new Date(run.updatedAt),
})

const workflowRunUpdateFromRun = (run: WorkflowRun): Partial<WorkflowRunInsert> => ({
  workflowId: run.workflowId,
  accountId: run.accountId,
  workflowVersion: run.workflowVersion,
  runMode: run.runMode,
  selectedNodeId: run.selectedNodeId,
  scopeGroupNodeId: run.scopeGroupNodeId ?? null,
  snapshotNodes: run.snapshotNodes,
  snapshotEdges: run.snapshotEdges,
  nodeStates: run.nodeStates,
  status: run.status,
  error: run.error ?? null,
  startedAt: toDate(run.startedAt),
  completedAt: toDate(run.completedAt),
  updatedAt: new Date(run.updatedAt),
})

export class DrizzleWorkflowRepository implements WorkflowRepository {
  constructor(private readonly db: MinaDbClient) {}

  async create(workflow: Workflow): Promise<Workflow> {
    await this.db.insert(workflows).values(workflowInsertFromWorkflow(workflow))
    return workflow
  }

  async createRun(run: WorkflowRun): Promise<WorkflowRun> {
    await this.db.insert(workflowRuns).values(workflowRunInsertFromRun(run))
    return run
  }

  async delete(id: string): Promise<boolean> {
    const [row] = await this.db
      .update(workflows)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(workflows.id, id), isNull(workflows.deletedAt)))
      .returning({ id: workflows.id })

    return row !== undefined
  }

  async findById(id: string): Promise<Workflow | undefined> {
    const [row] = await this.db
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, id), isNull(workflows.deletedAt)))
      .limit(1)

    return row ? workflowFromRow(row) : undefined
  }

  async findRunById(id: string): Promise<WorkflowRun | undefined> {
    const [row] = await this.db.select().from(workflowRuns).where(eq(workflowRuns.id, id)).limit(1)
    return row ? workflowRunFromRow(row) : undefined
  }

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

  async list(accountId?: string): Promise<Workflow[]> {
    const rows = accountId
      ? await this.db
          .select()
          .from(workflows)
          .where(and(eq(workflows.accountId, accountId), isNull(workflows.deletedAt)))
          .orderBy(desc(workflows.updatedAt))
      : await this.db.select().from(workflows).where(isNull(workflows.deletedAt)).orderBy(desc(workflows.updatedAt))

    return rows.map(workflowFromRow)
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

  async listRuns(workflowId?: string): Promise<WorkflowRun[]> {
    const rows = workflowId
      ? await this.db
          .select()
          .from(workflowRuns)
          .where(eq(workflowRuns.workflowId, workflowId))
          .orderBy(desc(workflowRuns.createdAt))
      : await this.db.select().from(workflowRuns).orderBy(desc(workflowRuns.createdAt))

    return rows.map(workflowRunFromRow)
  }

  async listRunsByStatus(status: WorkflowRun['status']): Promise<WorkflowRun[]> {
    const rows = await this.db.select().from(workflowRuns).where(eq(workflowRuns.status, status))
    return rows.map(workflowRunFromRow)
  }

  async update(workflow: Workflow): Promise<Workflow> {
    await this.db.update(workflows).set(workflowUpdateFromWorkflow(workflow)).where(eq(workflows.id, workflow.id))
    return workflow
  }

  async updateNodeMediaView(
    workflowId: string,
    nodeId: string,
    mediaView: NodeMediaViewState | undefined,
  ): Promise<Workflow> {
    const workflow = await this.findById(workflowId)
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
      updatedAt: nowIso(),
    }

    await this.update(updated)
    return updated
  }

  async updateRun(run: WorkflowRun): Promise<WorkflowRun> {
    await this.db.update(workflowRuns).set(workflowRunUpdateFromRun(run)).where(eq(workflowRuns.id, run.id))
    return run
  }

  async updateRunNodeState(runId: string, nodeId: string, state: WorkflowRunNodeState): Promise<WorkflowRun> {
    const run = await this.findRunById(runId)
    if (!run) {
      throw new Error('Workflow run not found.')
    }

    const updated: WorkflowRun = {
      ...run,
      nodeStates: {
        ...run.nodeStates,
        [nodeId]: state,
      },
      updatedAt: nowIso(),
    }

    await this.updateRun(updated)
    return updated
  }
}
