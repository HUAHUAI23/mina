import type { Account, AuthSession, User } from '@mina/contracts/modules/accounts'
import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import type { PricingRule } from '@mina/contracts/modules/pricing'
import type { Task, TaskResource } from '@mina/contracts/modules/tasks'
import type { WorkflowRun, WorkflowRunNodeState, WorkflowSummary } from '@mina/contracts/modules/workflows'

import type {
  CreatePresignedGetUrlInput,
  CreatePresignedPutUrlInput,
  DeleteAccountObjectInput,
  ObjectStorage,
  ObjectStorageBody,
  PresignedPutObjectUrl,
  PutAccountObjectInput,
  StoredObject,
} from '../lib/storage/object-storage'
import { assertAccountStorageKey, buildAccountStorageKey } from '../lib/storage/storage-key'
import type {
  AccountsRepository,
  CreateSessionInput,
  PasswordCredential,
  RegisterUserWithAccountInput,
  StoredSession,
} from '../modules/accounts/accounts.repository'
import type { MediaObject, MediaObjectStatus } from '../modules/media/media-object'
import type { CreateUploadingMediaObjectInput, MediaObjectRepository } from '../modules/media/media-object.repository'
import { createDefaultPricingRules } from '../modules/pricing/pricing.repository'
import type { PricingRepository } from '../modules/pricing/pricing.repository'
import type { TaskEventInput, TaskEventLog } from '../modules/tasks/task-events'
import type { TaskCreateResult, TaskRepository } from '../modules/tasks/tasks.repository'
import type { WorkflowRunEventInput, WorkflowRunEventLog } from '../modules/workflows/workflow-events'
import type {
  WorkflowYjsRepository,
  WorkflowYjsSnapshotRecord,
  WorkflowYjsUpdateRecord,
} from '../modules/workflows/collaboration/workflow-yjs-repository'
import type {
  WorkflowDefinitionCreate,
  WorkflowDefinitionRepository,
} from '../modules/workflows/repositories/workflow-definition.repository'
import type { WorkflowRunDependencyRepository } from '../modules/workflows/repositories/workflow-run-dependency.repository'
import type {
  CreateRunWithSnapshotInput,
  ClaimWorkflowRunByIdInput,
  ClaimWorkflowRunsInput,
  MarkRunFailedInput,
  MarkRunTerminalInput,
  ReleaseWorkflowRunLeaseInput,
  WorkflowRunRepository,
} from '../modules/workflows/repositories/workflow-run.repository'
import type {
  ListRunnableNodesInput,
  ListRunningNodesInput,
  MarkNodeFailedInput,
  MarkNodeRunningInput,
  MarkNodeSucceededInput,
  TryMarkNodeStartingInput,
  WorkflowRunNodeStateRepository,
} from '../modules/workflows/repositories/workflow-run-node-state.repository'
import type { WorkflowNodeTaskLink, WorkflowNodeTaskRepository } from '../modules/workflows/repositories/workflow-node-task.repository'
import {
  cloneRun,
  cloneWorkflowSummary,
  normalizeWorkflowEdge,
  normalizeWorkflowNode,
  workflowSummaryDto,
  workflowRunDto,
} from '../modules/workflows/repositories/workflow-mappers'
import type {
  ClaimedWorkflowRun,
  WorkflowRunNodeDependency,
  WorkflowRunNodeExecutionItem,
  WorkflowRunRecord,
  WorkflowRunSnapshot,
  WorkflowRunStateSummary,
} from '../modules/workflows/repositories/workflow-types'

interface StoredObjectValue {
  body: ObjectStorageBody
  contentType?: string
  metadata?: Record<string, string>
}

export class FakeObjectStorage implements ObjectStorage {
  readonly #bucket: string
  readonly #objects = new Map<string, StoredObjectValue>()
  readonly #rootPrefix: string

  constructor(bucket = 'mina-test-storage', rootPrefix = 'users') {
    this.#bucket = bucket
    this.#rootPrefix = rootPrefix
  }

  async createPresignedGetUrl(input: CreatePresignedGetUrlInput): Promise<string> {
    assertAccountStorageKey(input.accountId, input.key, this.#rootPrefix)
    return this.objectUrl(input.key)
  }

  async createPresignedPutUrl(input: CreatePresignedPutUrlInput): Promise<PresignedPutObjectUrl> {
    const key = buildAccountStorageKey({
      accountId: input.accountId,
      objectName: input.objectName,
      rootPrefix: this.#rootPrefix,
      scope: input.scope,
    })
    return {
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000).toISOString(),
      key,
      url: this.objectUrl(key),
    }
  }

  async deleteObject(input: DeleteAccountObjectInput): Promise<void> {
    assertAccountStorageKey(input.accountId, input.key, this.#rootPrefix)
    this.#objects.delete(input.key)
  }

  async putObject(input: PutAccountObjectInput): Promise<StoredObject> {
    const key = buildAccountStorageKey({
      accountId: input.accountId,
      objectName: input.objectName,
      rootPrefix: this.#rootPrefix,
      scope: input.scope,
    })
    this.#objects.set(key, {
      body: input.body,
      ...(input.contentType ? { contentType: input.contentType } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    })

    return {
      bucket: this.#bucket,
      key,
      url: this.objectUrl(key),
    }
  }

  private objectUrl(key: string): string {
    return `fake://${this.#bucket}/${key}`
  }
}

const clone = <T>(value: T): T => structuredClone(value)

export class FakeAccountsRepository implements AccountsRepository {
  readonly #accounts = new Map<string, Account>()
  readonly #passwordCredentials = new Map<string, PasswordCredential>()
  readonly #sessions = new Map<string, AuthSession & { tokenHash: string }>()
  readonly #users = new Map<string, User>()

  constructor(initialUsers: User[] = []) {
    for (const user of initialUsers) {
      this.#users.set(user.id, clone(user))
    }
  }

  async addPasswordCredential(input: RegisterUserWithAccountInput['passwordCredential']): Promise<PasswordCredential> {
    const now = new Date().toISOString()
    const credential: PasswordCredential = {
      createdAt: now,
      passwordHash: input.passwordHash,
      updatedAt: now,
      userId: input.userId,
    }
    this.#passwordCredentials.set(input.userId, credential)
    return clone(credential)
  }

  async addAccount(input: RegisterUserWithAccountInput['account']): Promise<Account> {
    const now = new Date().toISOString()
    const account: Account = {
      createdAt: now,
      id: input.id,
      name: input.name,
      ownerUserId: input.ownerUserId,
      storageRootPrefix: input.storageRootPrefix,
      updatedAt: now,
    }
    this.#accounts.set(account.id, account)
    return clone(account)
  }

  async createSession(input: CreateSessionInput): Promise<AuthSession> {
    const session = {
      expiresAt: input.expiresAt,
      id: input.id,
      token: input.token,
      tokenHash: input.tokenHash,
      userId: input.userId,
    }
    this.#sessions.set(input.id, session)
    return clone(session)
  }

  async addUser(input: RegisterUserWithAccountInput['user']): Promise<User> {
    const now = new Date().toISOString()
    const user: User = {
      createdAt: now,
      displayName: input.displayName,
      email: input.email,
      id: input.id,
      role: input.role,
      updatedAt: now,
      username: input.username,
    }
    this.#users.set(user.id, user)
    return clone(user)
  }

  async registerUserWithAccount(input: RegisterUserWithAccountInput): Promise<{ account: Account; user: User }> {
    const user = await this.addUser(input.user)
    await this.addPasswordCredential(input.passwordCredential)
    const account = await this.addAccount(input.account)
    return { account, user }
  }

  async findPasswordCredentialByUserId(userId: string): Promise<PasswordCredential | undefined> {
    const credential = this.#passwordCredentials.get(userId)
    return credential ? clone(credential) : undefined
  }

  async findAccountByOwnerUserId(userId: string): Promise<Account | undefined> {
    const account = [...this.#accounts.values()].find((item) => item.ownerUserId === userId)
    return account ? clone(account) : undefined
  }

  async findSessionByTokenHash(tokenHash: string): Promise<StoredSession | undefined> {
    const session = [...this.#sessions.values()].find((item) => item.tokenHash === tokenHash)
    return session ? clone(session) : undefined
  }

  async findUserByEmail(email: string): Promise<User | undefined> {
    const normalizedEmail = email.toLowerCase()
    const user = [...this.#users.values()].find((item) => item.email.toLowerCase() === normalizedEmail)
    return user ? clone(user) : undefined
  }

  async findUserById(id: string): Promise<User | undefined> {
    const user = this.#users.get(id)
    return user ? clone(user) : undefined
  }

  async findUserByUsername(username: string): Promise<User | undefined> {
    const normalizedUsername = username.toLowerCase()
    const user = [...this.#users.values()].find((item) => item.username?.toLowerCase() === normalizedUsername)
    return user ? clone(user) : undefined
  }
}

export class FakePricingRepository implements PricingRepository {
  readonly #rules: PricingRule[]

  constructor(rules: PricingRule[] = createDefaultPricingRules()) {
    this.#rules = rules.map((rule) => ({ ...rule }))
  }

  async listRules(): Promise<PricingRule[]> {
    return this.#rules.map((rule) => ({ ...rule }))
  }
}

export class FakeMediaObjectRepository implements MediaObjectRepository {
  readonly #mediaObjects = new Map<string, MediaObject>()

  async create(mediaObject: MediaObject): Promise<MediaObject> {
    this.#mediaObjects.set(mediaObject.id, clone(mediaObject))
    return clone(mediaObject)
  }

  async createUploading(input: CreateUploadingMediaObjectInput): Promise<MediaObject> {
    const timestamp = new Date().toISOString()
    const mediaObject: MediaObject = {
      accountId: input.accountId,
      bucket: input.bucket,
      byteSize: input.byteSize,
      createdAt: timestamp,
      expiresAt: input.expiresAt,
      id: input.id,
      kind: input.kind,
      mimeType: input.mimeType,
      origin: input.origin,
      purpose: input.purpose,
      retention: input.retention,
      status: 'uploading',
      storageKey: input.storageKey,
      updatedAt: timestamp,
      url: input.url,
    }
    this.#mediaObjects.set(mediaObject.id, clone(mediaObject))
    return clone(mediaObject)
  }

  async findById(accountId: string, id: string): Promise<MediaObject | undefined> {
    const mediaObject = this.#mediaObjects.get(id)
    return mediaObject?.accountId === accountId ? clone(mediaObject) : undefined
  }

  async getAccountStorageUsage(accountId: string): Promise<number> {
    return [...this.#mediaObjects.values()]
      .filter((mediaObject) => mediaObject.accountId === accountId && mediaObject.status === 'ready' && !mediaObject.deletedAt)
      .reduce((total, mediaObject) => total + mediaObject.byteSize, 0)
  }

  async listExpiredUploading(cutoffIso: string): Promise<MediaObject[]> {
    return [...this.#mediaObjects.values()]
      .filter(
        (mediaObject) =>
          mediaObject.status === 'uploading' &&
          (mediaObject.expiresAt ? mediaObject.expiresAt <= cutoffIso : mediaObject.updatedAt <= cutoffIso),
      )
      .map(clone)
  }

  async softDelete(accountId: string, id: string, deletedAtIso: string): Promise<void> {
    const mediaObject = this.#mediaObjects.get(id)
    if (!mediaObject || mediaObject.accountId !== accountId) {
      return
    }
    this.#mediaObjects.set(id, {
      ...mediaObject,
      status: 'deleted',
      deletedAt: deletedAtIso,
      updatedAt: deletedAtIso,
    })
  }

  async updateStatus(
    accountId: string,
    id: string,
    status: MediaObjectStatus,
    updatedAtIso: string,
  ): Promise<MediaObject> {
    const mediaObject = this.#mediaObjects.get(id)
    if (!mediaObject || mediaObject.accountId !== accountId) {
      throw new Error('Media object not found.')
    }
    const updated: MediaObject = {
      ...mediaObject,
      status,
      ...(status === 'deleted' ? { deletedAt: updatedAtIso } : {}),
      updatedAt: updatedAtIso,
    }
    this.#mediaObjects.set(id, clone(updated))
    return clone(updated)
  }
}

export class FakeTaskRepository implements TaskRepository {
  readonly #resources = new Map<string, TaskResource[]>()
  readonly #tasks = new Map<string, Task>()

  async appendResources(taskId: string, resources: TaskResource[]): Promise<void> {
    const existing = this.#resources.get(taskId) ?? []
    this.#resources.set(taskId, [...existing, ...resources.map(clone)])
  }

  async claimQueuedTasksForStart(limit: number, leaseSeconds: number): Promise<Task[]> {
    const now = new Date()
    const leaseUntil = new Date(now.getTime() + leaseSeconds * 1000).toISOString()
    const claimed = [...this.#tasks.values()]
      .filter((task) => {
        const isDue = !task.nextRetryAt || new Date(task.nextRetryAt) <= now
        return task.status === 'queued' && isDue
      })
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(0, limit)
    for (const task of claimed) {
      this.#tasks.set(task.id, clone({ ...task, nextRetryAt: leaseUntil }))
    }
    return claimed.map(clone)
  }

  async claimRunningAsyncTasksForPolling(limit: number, leaseSeconds: number): Promise<Task[]> {
    const now = new Date()
    const leaseUntil = new Date(now.getTime() + leaseSeconds * 1000).toISOString()
    const claimed = [...this.#tasks.values()]
      .filter((task) => {
        const isDue = !task.nextRetryAt || new Date(task.nextRetryAt) <= now
        return task.status === 'running' && task.mode === 'async' && task.externalTaskId && isDue
      })
      .slice(0, limit)
    for (const task of claimed) {
      this.#tasks.set(task.id, clone({ ...task, nextRetryAt: leaseUntil }))
    }
    return claimed.map(clone)
  }

  async create(task: Task, resources: TaskResource[]): Promise<TaskCreateResult> {
    if (task.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(task.idempotencyKey)
      if (existing) {
        return { created: false, task: existing }
      }
    }

    this.#tasks.set(task.id, clone(task))
    this.#resources.set(task.id, resources.map(clone))
    return { created: true, task: clone(task) }
  }

  async findById(id: string): Promise<Task | undefined> {
    const task = this.#tasks.get(id)
    return task ? clone(task) : undefined
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<Task | undefined> {
    const task = [...this.#tasks.values()].find((item) => item.idempotencyKey === idempotencyKey)
    return task ? clone(task) : undefined
  }

  async list(accountId?: string): Promise<Task[]> {
    return [...this.#tasks.values()]
      .filter((task) => !accountId || task.accountId === accountId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(clone)
  }

  async listResources(taskId: string): Promise<TaskResource[]> {
    return (this.#resources.get(taskId) ?? []).map(clone)
  }

  async update(task: Task): Promise<Task> {
    this.#tasks.set(task.id, clone(task))
    return clone(task)
  }
}

export class FakeTaskEventLog implements TaskEventLog {
  readonly #events: TaskEventInput[] = []

  async listEvents(taskId: string): Promise<TaskEventInput[]> {
    return this.#events.filter((event) => event.taskId === taskId).map(clone)
  }

  async record(input: TaskEventInput): Promise<void> {
    this.#events.push(clone(input))
  }
}

export class FakeWorkflowRunEventLog implements WorkflowRunEventLog {
  readonly #events: WorkflowRunEventInput[] = []

  async listEvents(workflowRunId: string): Promise<WorkflowRunEventInput[]> {
    return this.#events.filter((event) => event.workflowRunId === workflowRunId).map(clone)
  }

  async record(input: WorkflowRunEventInput): Promise<void> {
    this.#events.push(clone(input))
  }
}

export class FakeWorkflowYjsRepository implements WorkflowYjsRepository {
  readonly #snapshots = new Map<string, WorkflowYjsSnapshotRecord>()
  readonly #updates = new Map<string, WorkflowYjsUpdateRecord[]>()

  async appendUpdate(input: { id: string; updateBin: Uint8Array; workflowId: string }): Promise<void> {
    const updates = this.#updates.get(input.workflowId) ?? []
    updates.push({
      createdAt: new Date().toISOString(),
      id: input.id,
      updateBin: new Uint8Array(input.updateBin),
      workflowId: input.workflowId,
    })
    this.#updates.set(input.workflowId, updates)
  }

  async deleteUpdates(workflowId: string, through?: Date): Promise<void> {
    if (!through) {
      this.#updates.delete(workflowId)
      return
    }
    this.#updates.set(
      workflowId,
      (this.#updates.get(workflowId) ?? []).filter((update) => new Date(update.createdAt) > through),
    )
  }

  async getSnapshot(workflowId: string): Promise<WorkflowYjsSnapshotRecord | undefined> {
    const snapshot = this.#snapshots.get(workflowId)
    return snapshot
      ? {
          snapshotBin: new Uint8Array(snapshot.snapshotBin),
          stateVector: new Uint8Array(snapshot.stateVector),
          version: snapshot.version,
          workflowId: snapshot.workflowId,
        }
      : undefined
  }

  async listUpdates(workflowId: string, after?: Date): Promise<WorkflowYjsUpdateRecord[]> {
    return (this.#updates.get(workflowId) ?? [])
      .filter((update) => !after || new Date(update.createdAt) > after)
      .map((update) => ({
        createdAt: update.createdAt,
        id: update.id,
        updateBin: new Uint8Array(update.updateBin),
        workflowId: update.workflowId,
      }))
  }

  async saveSnapshot(input: WorkflowYjsSnapshotRecord): Promise<void> {
    this.#snapshots.set(input.workflowId, {
      snapshotBin: new Uint8Array(input.snapshotBin),
      stateVector: new Uint8Array(input.stateVector),
      version: input.version,
      workflowId: input.workflowId,
    })
  }
}

export class FakeWorkflowDefinitionRepository implements WorkflowDefinitionRepository {
  readonly #workflows = new Map<string, WorkflowSummary>()

  async create(input: WorkflowDefinitionCreate): Promise<WorkflowSummary> {
    const workflow = workflowSummaryDto({
      accountId: input.accountId,
      createdAt: input.timestamp,
      id: input.id,
      name: input.name,
      updatedAt: input.timestamp,
      version: input.version,
    })
    this.#workflows.set(workflow.id, cloneWorkflowSummary(workflow))
    return cloneWorkflowSummary(workflow)
  }

  async delete(id: string): Promise<boolean> {
    return this.#workflows.delete(id)
  }

  async findById(id: string): Promise<WorkflowSummary | undefined> {
    const workflow = this.#workflows.get(id)
    return workflow ? cloneWorkflowSummary(workflow) : undefined
  }

  async list(accountId?: string): Promise<WorkflowSummary[]> {
    return [...this.#workflows.values()]
      .filter((workflow) => !accountId || workflow.accountId === accountId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(cloneWorkflowSummary)
  }

  async touch(id: string, timestamp: string, version: number): Promise<WorkflowSummary> {
    const existing = this.#workflows.get(id)
    if (!existing) {
      throw new Error('Workflow not found.')
    }

    const workflow = workflowSummaryDto({
      accountId: existing.accountId,
      createdAt: existing.createdAt,
      id: existing.id,
      name: existing.name,
      updatedAt: timestamp,
      version,
    })
    this.#workflows.set(workflow.id, cloneWorkflowSummary(workflow))
    return cloneWorkflowSummary(workflow)
  }

}

const isoDateOrUndefined = (value: string | undefined): Date | undefined => (value ? new Date(value) : undefined)

interface StoredRun {
  dependencies: WorkflowRunNodeDependency[]
  executableNodeIds: string[]
  leasedBy: string | undefined
  leaseToken: string | undefined
  leaseUntil: string | undefined
  nextReconcileAt: string | undefined
  run: WorkflowRunRecord
  snapshotEdges: WorkflowCanvasEdge[]
  snapshotNodes: WorkflowCanvasNode[]
  states: Record<string, WorkflowRunNodeState>
}

export class FakeWorkflowRunRepository
  implements WorkflowRunRepository, WorkflowRunNodeStateRepository, WorkflowRunDependencyRepository
{
  readonly #runs = new Map<string, StoredRun>()

  async cancelRun(runId: string, timestamp: string): Promise<WorkflowRunRecord | undefined> {
    const stored = this.#runs.get(runId)
    if (!stored || (stored.run.status !== 'running' && stored.run.status !== 'queued')) {
      return undefined
    }
    stored.run = {
      ...stored.run,
      completedAt: timestamp,
      status: 'cancelled',
      updatedAt: timestamp,
    }
    return clone(stored.run)
  }

  async claimRunById(input: ClaimWorkflowRunByIdInput): Promise<ClaimedWorkflowRun | undefined> {
    const now = new Date()
    const stored = this.#runs.get(input.runId)
    const leaseUntil = isoDateOrUndefined(stored?.leaseUntil)
    if (!stored || stored.run.status !== 'running' || (leaseUntil && leaseUntil > now)) {
      return undefined
    }

    const leaseToken = `lease_${crypto.randomUUID()}`
    stored.leasedBy = input.instanceId
    stored.leaseToken = leaseToken
    stored.leaseUntil = new Date(now.getTime() + input.leaseSeconds * 1000).toISOString()
    stored.run = {
      ...stored.run,
      updatedAt: now.toISOString(),
    }
    return {
      ...clone(stored.run),
      leaseToken,
    }
  }

  async claimRunningRuns(input: ClaimWorkflowRunsInput): Promise<ClaimedWorkflowRun[]> {
    const now = new Date()
    const claimed: ClaimedWorkflowRun[] = []
    const candidates = [...this.#runs.values()]
      .filter((stored) => {
        const nextReconcileAt = isoDateOrUndefined(stored.nextReconcileAt)
        const leaseUntil = isoDateOrUndefined(stored.leaseUntil)
        return (
          stored.run.status === 'running' &&
          (!nextReconcileAt || nextReconcileAt <= now) &&
          (!leaseUntil || leaseUntil <= now)
        )
      })
      .sort((left, right) => left.run.updatedAt.localeCompare(right.run.updatedAt))
      .slice(0, input.limit)

    for (const stored of candidates) {
      const leaseToken = `lease_${crypto.randomUUID()}`
      const updatedAt = now.toISOString()
      stored.leasedBy = input.instanceId
      stored.leaseToken = leaseToken
      stored.leaseUntil = new Date(now.getTime() + input.leaseSeconds * 1000).toISOString()
      stored.run = {
        ...stored.run,
        updatedAt,
      }
      claimed.push({
        ...clone(stored.run),
        leaseToken,
      })
    }

    return claimed
  }

  async createRunWithSnapshot(input: CreateRunWithSnapshotInput): Promise<WorkflowRun> {
    const states = Object.fromEntries(
      input.executableNodeIds.map((nodeId) => [nodeId, { status: 'pending' as const }]),
    )
    const stored: StoredRun = {
      dependencies: input.dependencies.map(clone),
      executableNodeIds: [...input.executableNodeIds],
      leasedBy: undefined,
      leaseToken: undefined,
      leaseUntil: undefined,
      nextReconcileAt: undefined,
      run: clone(input.run),
      snapshotEdges: input.snapshotEdges.map(normalizeWorkflowEdge),
      snapshotNodes: input.snapshotNodes.map(normalizeWorkflowNode),
      states,
    }
    this.#runs.set(input.run.id, stored)
    return this.runDto(stored)
  }

  async findRunById(id: string): Promise<WorkflowRun | undefined> {
    const stored = this.#runs.get(id)
    return stored ? this.runDto(stored) : undefined
  }

  async getNodeState(workflowRunId: string, nodeId: string): Promise<WorkflowRunNodeState | undefined> {
    const state = this.#runs.get(workflowRunId)?.states[nodeId]
    return state ? clone(state) : undefined
  }

  async getSnapshot(runId: string): Promise<WorkflowRunSnapshot | undefined> {
    const stored = this.#runs.get(runId)
    if (!stored) {
      return undefined
    }
    return {
      dependencies: stored.dependencies.map(clone),
      edges: stored.snapshotEdges.map(normalizeWorkflowEdge),
      executableNodeIds: [...stored.executableNodeIds],
      nodes: stored.snapshotNodes.map(normalizeWorkflowNode),
      run: clone(stored.run),
    }
  }

  async listDependencies(workflowRunId: string): Promise<WorkflowRunNodeDependency[]> {
    return (this.#runs.get(workflowRunId)?.dependencies ?? []).map(clone)
  }

  async listRunnableNodes(input: ListRunnableNodesInput): Promise<WorkflowRunNodeExecutionItem[]> {
    const stored = this.#runs.get(input.workflowRunId)
    if (!stored) {
      return []
    }

    const succeeded = new Set(
      Object.entries(stored.states)
        .filter(([, state]) => state.status === 'succeeded')
        .map(([nodeId]) => nodeId),
    )
    const nodeMap = new Map(stored.snapshotNodes.map((node) => [node.id, node]))
    return Object.entries(stored.states)
      .filter(([nodeId, state]) => {
        if (state.status !== 'pending') {
          return false
        }
        return stored.dependencies
          .filter((dependency) => dependency.nodeId === nodeId)
          .every((dependency) => succeeded.has(dependency.dependsOnNodeId))
      })
      .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
      .slice(0, input.limit)
      .map(([nodeId, state]) => ({
        node: normalizeWorkflowNode(nodeMap.get(nodeId) ?? this.missingNode(nodeId)),
        state: {
          nodeId,
          ...(state.taskId ? { taskId: state.taskId } : {}),
        },
      }))
  }

  async listRunningNodes(input: ListRunningNodesInput): Promise<WorkflowRunNodeExecutionItem[]> {
    const stored = this.#runs.get(input.workflowRunId)
    if (!stored) {
      return []
    }
    const nodeMap = new Map(stored.snapshotNodes.map((node) => [node.id, node]))
    return Object.entries(stored.states)
      .filter(([, state]) => state.status === 'running')
      .map(([nodeId, state]) => ({
        node: normalizeWorkflowNode(nodeMap.get(nodeId) ?? this.missingNode(nodeId)),
        state: {
          nodeId,
          ...(state.taskId ? { taskId: state.taskId } : {}),
        },
      }))
  }

  async listRuns(workflowId?: string): Promise<WorkflowRun[]> {
    return [...this.#runs.values()]
      .filter((stored) => !workflowId || stored.run.workflowId === workflowId)
      .sort((left, right) => right.run.createdAt.localeCompare(left.run.createdAt))
      .map((stored) => this.runDto(stored))
  }

  async markNodeFailed(input: MarkNodeFailedInput): Promise<boolean> {
    const stored = this.#runs.get(input.workflowRunId)
    const state = stored?.states[input.nodeId]
    const expectedStatus = input.expectedStatus ?? 'running'
    if (!stored || !state || state.status !== expectedStatus) {
      return false
    }
    if (input.taskId && state.taskId !== input.taskId) {
      return false
    }
    stored.states[input.nodeId] = {
      ...state,
      completedAt: input.completedAt,
      error: input.error,
      status: 'failed',
    }
    stored.run.updatedAt = input.completedAt
    return true
  }

  async markNodeRunning(input: MarkNodeRunningInput): Promise<boolean> {
    const stored = this.#runs.get(input.workflowRunId)
    const state = stored?.states[input.nodeId]
    if (!stored || !state || state.status !== 'pending') {
      return false
    }
    stored.states[input.nodeId] = {
      startedAt: input.startedAt,
      status: 'running',
      taskId: input.taskId,
    }
    stored.run.updatedAt = input.startedAt
    return true
  }

  async markNodeSucceeded(input: MarkNodeSucceededInput): Promise<boolean> {
    const stored = this.#runs.get(input.workflowRunId)
    const state = stored?.states[input.nodeId]
    if (!stored || !state || state.status !== 'running' || state.taskId !== input.taskId) {
      return false
    }
    stored.states[input.nodeId] = {
      ...state,
      completedAt: input.completedAt,
      output: input.output,
      status: 'succeeded',
    }
    stored.run.updatedAt = input.completedAt
    return true
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
    const stored = this.#runs.get(input.runId)
    if (!stored || stored.leaseToken !== input.leaseToken) {
      return
    }
    stored.leasedBy = undefined
    stored.leaseToken = undefined
    stored.leaseUntil = undefined
    stored.nextReconcileAt = input.nextReconcileAt
    stored.run.updatedAt = new Date().toISOString()
  }

  async summarizeRunStates(workflowRunId: string): Promise<WorkflowRunStateSummary> {
    const states = Object.values(this.#runs.get(workflowRunId)?.states ?? {})
    const summary: WorkflowRunStateSummary = {
      failed: 0,
      pending: 0,
      running: 0,
      skipped: 0,
      succeeded: 0,
      total: states.length,
    }
    for (const state of states) {
      summary[state.status] += 1
    }
    return summary
  }

  async tryMarkNodeStarting(input: TryMarkNodeStartingInput): Promise<boolean> {
    const state = this.#runs.get(input.workflowRunId)?.states[input.nodeId]
    return state?.status === 'pending'
  }

  private markTerminal(
    input: MarkRunTerminalInput,
    status: WorkflowRunRecord['status'],
    error?: WorkflowRunRecord['error'],
  ): WorkflowRunRecord | undefined {
    const stored = this.#runs.get(input.runId)
    if (!stored || stored.run.status !== 'running') {
      return undefined
    }
    if (input.leaseToken && stored.leaseToken !== input.leaseToken) {
      return undefined
    }
    stored.run = {
      ...stored.run,
      ...(error ? { error } : {}),
      completedAt: input.timestamp,
      status,
      updatedAt: input.timestamp,
    }
    return clone(stored.run)
  }

  private missingNode(nodeId: string): WorkflowCanvasNode {
    throw new Error(`Workflow run node snapshot "${nodeId}" is missing.`)
  }

  private runDto(stored: StoredRun): WorkflowRun {
    return cloneRun(
      workflowRunDto({
        nodeStates: stored.states,
        run: stored.run,
        snapshotEdges: stored.snapshotEdges,
        snapshotNodes: stored.snapshotNodes,
      }),
    )
  }
}

export class FakeWorkflowNodeTaskRepository implements WorkflowNodeTaskRepository {
  readonly #links: WorkflowNodeTaskLink[] = []

  constructor(private readonly workflowRunRepository: WorkflowRunRepository) {}

  async linkNodeTask(link: WorkflowNodeTaskLink): Promise<void> {
    if (this.#links.some((item) => item.workflowRunId === link.workflowRunId && item.nodeId === link.nodeId)) {
      return
    }
    this.#links.push({ ...link })
  }

  async listNodeTaskLinks(workflowId: string, nodeId: string): Promise<WorkflowNodeTaskLink[]> {
    const runs = await this.workflowRunRepository.listRuns(workflowId)
    const runIds = new Set(runs.map((run) => run.id))
    return this.#links.filter((link) => link.nodeId === nodeId && runIds.has(link.workflowRunId)).map((link) => ({ ...link }))
  }
}
