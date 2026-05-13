import type { BillingMetric, Task, TaskResource } from '@mina/contracts'
import { TaskResourceSchema, TaskSchema } from '@mina/contracts'
import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, or } from 'drizzle-orm'

import type { MinaDbClient } from '../../db/client'
import { taskResources, tasks } from '../../db/schema'
import type { TaskRepository } from './tasks.repository'

type TaskRow = typeof tasks.$inferSelect
type TaskInsert = typeof tasks.$inferInsert
type TaskResourceRow = typeof taskResources.$inferSelect
type TaskResourceInsert = typeof taskResources.$inferInsert

const toIso = (value: Date): string => value.toISOString()

const toDate = (value: string | undefined): Date | null => (value ? new Date(value) : null)

const leaseUntil = (date: Date, leaseSeconds: number): Date => new Date(date.getTime() + leaseSeconds * 1000)

const taskFromRow = (row: TaskRow): Task =>
  TaskSchema.parse({
    id: row.id,
    accountId: row.accountId,
    ...(row.idempotencyKey ? { idempotencyKey: row.idempotencyKey } : {}),
    kind: row.kind,
    mode: row.mode,
    provider: row.provider,
    model: row.model,
    status: row.status,
    config: row.config,
    ...(row.externalTaskId ? { externalTaskId: row.externalTaskId } : {}),
    ...(row.providerStatus ? { providerStatus: row.providerStatus } : {}),
    ...(row.providerMetadata ? { providerMetadata: row.providerMetadata } : {}),
    cost: {
      estimatedCost: Number(row.estimatedCost),
      ...(row.actualCost !== null ? { actualCost: Number(row.actualCost) } : {}),
      usage: {
        metric: row.usageMetric as BillingMetric,
        amount: Number(row.estimatedUsageAmount),
      },
    },
    ...(row.output ? { output: row.output } : {}),
    ...(row.errorCode && row.errorMessage ? { error: { code: row.errorCode, message: row.errorMessage } } : {}),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    ...(row.submittedAt ? { submittedAt: toIso(row.submittedAt) } : {}),
    ...(row.startedAt ? { startedAt: toIso(row.startedAt) } : {}),
    ...(row.lastPolledAt ? { lastPolledAt: toIso(row.lastPolledAt) } : {}),
    ...(row.nextRetryAt ? { nextRetryAt: toIso(row.nextRetryAt) } : {}),
    ...(row.expiresAt ? { expiresAt: toIso(row.expiresAt) } : {}),
    ...(row.completedAt ? { completedAt: toIso(row.completedAt) } : {}),
    retryCount: row.retryCount,
  })

const taskInsertFromTask = (task: Task): TaskInsert => ({
  id: task.id,
  accountId: task.accountId,
  idempotencyKey: task.idempotencyKey ?? null,
  kind: task.kind,
  mode: task.mode,
  provider: task.provider,
  model: task.model,
  status: task.status,
  config: task.config,
  externalTaskId: task.externalTaskId ?? null,
  providerStatus: task.providerStatus ?? null,
  providerMetadata: task.providerMetadata ?? null,
  estimatedCost: String(task.cost.estimatedCost),
  actualCost: task.cost.actualCost === undefined ? null : String(task.cost.actualCost),
  usageMetric: task.cost.usage.metric,
  estimatedUsageAmount: String(task.cost.usage.amount),
  actualUsageAmount: null,
  output: task.output ?? null,
  errorCode: task.error?.code ?? null,
  errorMessage: task.error?.message ?? null,
  retryCount: task.retryCount ?? 0,
  nextRetryAt: toDate(task.nextRetryAt),
  submittedAt: toDate(task.submittedAt),
  lastPolledAt: toDate(task.lastPolledAt),
  expiresAt: toDate(task.expiresAt),
  startedAt: toDate(task.startedAt),
  completedAt: toDate(task.completedAt),
  createdAt: new Date(task.createdAt),
  updatedAt: new Date(task.updatedAt),
})

const taskUpdateFromTask = (task: Task): Partial<TaskInsert> => ({
  accountId: task.accountId,
  idempotencyKey: task.idempotencyKey ?? null,
  kind: task.kind,
  mode: task.mode,
  provider: task.provider,
  model: task.model,
  status: task.status,
  config: task.config,
  externalTaskId: task.externalTaskId ?? null,
  providerStatus: task.providerStatus ?? null,
  providerMetadata: task.providerMetadata ?? null,
  estimatedCost: String(task.cost.estimatedCost),
  actualCost: task.cost.actualCost === undefined ? null : String(task.cost.actualCost),
  usageMetric: task.cost.usage.metric,
  estimatedUsageAmount: String(task.cost.usage.amount),
  actualUsageAmount: null,
  output: task.output ?? null,
  errorCode: task.error?.code ?? null,
  errorMessage: task.error?.message ?? null,
  retryCount: task.retryCount ?? 0,
  startedAt: toDate(task.startedAt),
  completedAt: toDate(task.completedAt),
  nextRetryAt: toDate(task.nextRetryAt),
  submittedAt: toDate(task.submittedAt),
  lastPolledAt: toDate(task.lastPolledAt),
  expiresAt: toDate(task.expiresAt),
  updatedAt: new Date(task.updatedAt),
})

const taskResourceFromRow = (row: TaskResourceRow): TaskResource =>
  TaskResourceSchema.parse({
    id: row.id,
    accountId: row.accountId,
    taskId: row.taskId,
    direction: row.direction,
    kind: row.kind,
    url: row.url,
    ...(row.role ? { role: row.role } : {}),
    ...(row.outputIndex !== null ? { outputIndex: row.outputIndex } : {}),
    ...(row.metadata ? { metadata: row.metadata } : {}),
  })

const taskResourceInsertFromResource = (resource: TaskResource): TaskResourceInsert => ({
  id: resource.id,
  accountId: resource.accountId,
  taskId: resource.taskId,
  direction: resource.direction,
  kind: resource.kind,
  url: resource.url,
  role: resource.role ?? null,
  outputIndex: resource.outputIndex ?? null,
  metadata: resource.metadata ?? null,
})

export class DrizzleTaskRepository implements TaskRepository {
  constructor(private readonly db: MinaDbClient) {}

  async claimQueuedTasksForStart(limit: number, leaseSeconds: number): Promise<Task[]> {
    const now = new Date()
    const rows = await this.db.transaction(async (tx) => {
      const claimed = await tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.status, 'queued'), or(isNull(tasks.nextRetryAt), lte(tasks.nextRetryAt, now))))
        .orderBy(asc(tasks.createdAt))
        .limit(limit)
        .for('update', { skipLocked: true })

      if (claimed.length > 0) {
        await tx
          .update(tasks)
          .set({ nextRetryAt: leaseUntil(now, leaseSeconds), updatedAt: now })
          .where(
            inArray(
              tasks.id,
              claimed.map((task) => task.id),
            ),
          )
      }

      return claimed
    })

    return rows.map(taskFromRow)
  }

  async claimRunningAsyncTasksForPolling(limit: number, leaseSeconds: number): Promise<Task[]> {
    const now = new Date()
    const rows = await this.db.transaction(async (tx) => {
      const claimed = await tx
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.status, 'running'),
            eq(tasks.mode, 'async'),
            isNotNull(tasks.externalTaskId),
            or(isNull(tasks.nextRetryAt), lte(tasks.nextRetryAt, now)),
          ),
        )
        .orderBy(asc(tasks.updatedAt))
        .limit(limit)
        .for('update', { skipLocked: true })

      if (claimed.length > 0) {
        await tx
          .update(tasks)
          .set({ nextRetryAt: leaseUntil(now, leaseSeconds), updatedAt: now })
          .where(
            inArray(
              tasks.id,
              claimed.map((task) => task.id),
            ),
          )
      }

      return claimed
    })

    return rows.map(taskFromRow)
  }

  async create(task: Task, resources: TaskResource[]): Promise<Task> {
    await this.db.transaction(async (tx) => {
      await tx.insert(tasks).values(taskInsertFromTask(task))
      if (resources.length > 0) {
        await tx.insert(taskResources).values(resources.map(taskResourceInsertFromResource))
      }
    })

    return task
  }

  async findById(id: string): Promise<Task | undefined> {
    const [row] = await this.db.select().from(tasks).where(eq(tasks.id, id)).limit(1)
    return row ? taskFromRow(row) : undefined
  }

  async findByAccountIdAndIdempotencyKey(accountId: string, idempotencyKey: string): Promise<Task | undefined> {
    const [row] = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.accountId, accountId), eq(tasks.idempotencyKey, idempotencyKey)))
      .limit(1)
    return row ? taskFromRow(row) : undefined
  }

  async list(accountId?: string): Promise<Task[]> {
    const rows = accountId
      ? await this.db.select().from(tasks).where(eq(tasks.accountId, accountId)).orderBy(desc(tasks.createdAt))
      : await this.db.select().from(tasks).orderBy(desc(tasks.createdAt))

    return rows.map(taskFromRow)
  }

  async listResources(taskId: string): Promise<TaskResource[]> {
    const rows = await this.db.select().from(taskResources).where(eq(taskResources.taskId, taskId))
    return rows.map(taskResourceFromRow)
  }

  async update(task: Task): Promise<Task> {
    await this.db.update(tasks).set(taskUpdateFromTask(task)).where(eq(tasks.id, task.id))
    return task
  }

  async appendResources(_taskId: string, resources: TaskResource[]): Promise<void> {
    if (resources.length === 0) {
      return
    }

    await this.db.insert(taskResources).values(resources.map(taskResourceInsertFromResource))
  }
}
