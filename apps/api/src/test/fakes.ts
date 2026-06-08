import type { Account, AuthSession, User } from '@mina/contracts/modules/accounts'
import type {
  AssetFolderWithCount,
  AssetLibraryFolder,
  AssetLibraryItem,
  AssetLibraryItemWithRelations,
  AssetTag,
} from '@mina/contracts/modules/assets'
import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import type { PricingRule } from '@mina/contracts/modules/pricing'
import type { Project, ProjectWorkflow, ProjectWithWorkflows } from '@mina/contracts/modules/projects'
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
  UpdateUserAvatarInput,
  UpdateUserPreferencesInput,
  UpdateUserProfileInput,
} from '../modules/accounts/accounts.repository'
import type { MediaObject, MediaObjectRetention, MediaObjectStatus } from '../modules/media/media-object'
import { defaultAssetSystemTags } from '../modules/assets/asset-library-defaults'
import {
  assetFolderDto,
  assetFolderWithCountDto,
  assetItemDto,
  assetItemWithRelationsDto,
  assetTagDto,
} from '../modules/assets/asset-library-mappers'
import type {
  AssetLibraryRepository,
  CreateAssetFolderRecordInput,
  CreateAssetItemRecordInput,
  CreateAssetTagRecordInput,
  ListAssetItemsInput,
  ListAssetItemsResult,
} from '../modules/assets/asset-library.repository'
import type { MediaObjectService } from '../modules/media/media-object.service'
import type { CreateUploadingMediaObjectInput, MediaObjectRepository } from '../modules/media/media-object.repository'
import { createDefaultPricingRules } from '../modules/pricing/pricing.repository'
import type { PricingRepository } from '../modules/pricing/pricing.repository'
import {
  cloneProjectWithWorkflows,
  projectDto,
  projectWithWorkflowsDto,
  projectWorkflowDto,
} from '../modules/projects/project-mappers'
import type { CreateProjectRecordInput, ProjectRepository } from '../modules/projects/projects.repository'
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
import type {
  WorkflowNodeRuntimeRow,
  WorkflowNodeTaskLink,
  WorkflowNodeTaskRepository,
  WorkflowNodeTaskRuntimeLink,
} from '../modules/workflows/repositories/workflow-node-task.repository'
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

  getObjectForTest(key: string): { body: ObjectStorageBody; contentType?: string; metadata?: Record<string, string> } | undefined {
    return this.#objects.get(key)
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
      passwordVersion: 1,
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
      ...(input.preferredLocale ? { preferredLocale: input.preferredLocale } : {}),
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

  async updatePasswordCredential(
    userId: string,
    passwordHash: string,
    updatedAtIso: string,
  ): Promise<PasswordCredential> {
    const credential = this.#passwordCredentials.get(userId)
    if (!credential) {
      throw new Error('Password credential was not updated.')
    }
    const updated: PasswordCredential = {
      ...credential,
      passwordHash,
      passwordVersion: credential.passwordVersion + 1,
      updatedAt: updatedAtIso,
    }
    this.#passwordCredentials.set(userId, updated)
    return clone(updated)
  }

  async updateUserAvatar(input: UpdateUserAvatarInput): Promise<User> {
    const user = this.#users.get(input.userId)
    if (!user) {
      throw new Error('User avatar was not updated.')
    }
    const updated: User = {
      ...user,
      avatarMimeType: input.avatarMimeType,
      avatarStorageKey: input.avatarStorageKey,
      avatarUpdatedAt: input.avatarUpdatedAt,
      updatedAt: input.updatedAt,
    }
    this.#users.set(input.userId, updated)
    return clone(updated)
  }

  async updateUserPreferences(input: UpdateUserPreferencesInput): Promise<User> {
    const user = this.#users.get(input.userId)
    if (!user) {
      throw new Error('User preferences were not updated.')
    }
    const updated: User = {
      ...user,
      preferredLocale: input.preferredLocale,
      updatedAt: input.updatedAt,
    }
    this.#users.set(input.userId, updated)
    return clone(updated)
  }

  async updateUserProfile(input: UpdateUserProfileInput): Promise<User> {
    const user = this.#users.get(input.userId)
    if (!user) {
      throw new Error('User profile was not updated.')
    }
    const updated: User = {
      ...user,
      displayName: input.displayName,
      updatedAt: input.updatedAt,
    }
    this.#users.set(input.userId, updated)
    return clone(updated)
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

  async updateRetention(
    accountId: string,
    id: string,
    retention: MediaObjectRetention,
    updatedAtIso: string,
  ): Promise<MediaObject> {
    const mediaObject = this.#mediaObjects.get(id)
    if (!mediaObject || mediaObject.accountId !== accountId) {
      throw new Error('Media object not found.')
    }
    const updated: MediaObject = {
      ...mediaObject,
      retention,
      updatedAt: updatedAtIso,
    }
    this.#mediaObjects.set(id, clone(updated))
    return clone(updated)
  }
}

const includesText = (value: string | undefined, query: string): boolean =>
  Boolean(value?.toLowerCase().includes(query))

const sourceText = (value: Record<string, unknown>): string => JSON.stringify(value).toLowerCase()

const encodeFakeCursor = (offset: number): string => Buffer.from(JSON.stringify({ offset }), 'utf8').toString('base64url')

const decodeFakeCursor = (cursor: string | undefined): number => {
  if (!cursor) {
    return 0
  }
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown
    return parsed && typeof parsed === 'object' && 'offset' in parsed && typeof parsed.offset === 'number'
      ? Math.max(0, parsed.offset)
      : 0
  } catch {
    return 0
  }
}

const fakeItemQueryScore = (item: AssetLibraryItemWithRelations, query: string | undefined): number => {
  const normalized = query?.trim().toLowerCase()
  if (!normalized) {
    return 0
  }
  return (
    (includesText(item.displayName, normalized) ? 100 : 0) +
    (item.tags.some((tag) => includesText(tag.name, normalized) || includesText(tag.slug, normalized)) ? 70 : 0) +
    (includesText(item.sourceProjectName, normalized) || includesText(item.sourceProjectId, normalized) ? 45 : 0) +
    (includesText(item.description, normalized) ? 35 : 0) +
    (sourceText(item.sourceRef).includes(normalized) ? 15 : 0) +
    (item.mediaObject.metadata && sourceText(item.mediaObject.metadata).includes(normalized) ? 15 : 0) +
    (item.favoritedAt ? 3 : 0) +
    Math.min(item.usageCount, 10)
  )
}

export class FakeAssetLibraryRepository implements AssetLibraryRepository {
  readonly #folders = new Map<string, AssetLibraryFolder>()
  readonly #items = new Map<string, AssetLibraryItem>()
  readonly #itemTags = new Map<string, Set<string>>()
  readonly #tags = new Map<string, AssetTag>()

  constructor(private readonly mediaObjectService: MediaObjectService) {}

  async addTagToItem(input: { accountId: string; itemId: string; tagId: string; timestamp: string }): Promise<AssetLibraryItemWithRelations | undefined> {
    const item = this.#items.get(input.itemId)
    const tag = this.#tags.get(input.tagId)
    if (!item || item.accountId !== input.accountId || item.deletedAt || !tag || tag.accountId !== input.accountId || tag.deletedAt) {
      return undefined
    }
    const tagIds = this.#itemTags.get(input.itemId) ?? new Set<string>()
    tagIds.add(input.tagId)
    this.#itemTags.set(input.itemId, tagIds)
    this.touchItem(input.itemId, input.timestamp)
    this.refreshTagUsage(input.accountId)
    return this.findItemById(input.accountId, input.itemId)
  }

  async createFolder(input: CreateAssetFolderRecordInput): Promise<AssetFolderWithCount> {
    const folder = assetFolderDto({
      accountId: input.accountId,
      createdAt: input.timestamp,
      ...(input.createdByUserId ? { createdByUserId: input.createdByUserId } : {}),
      id: input.id,
      name: input.name,
      slug: input.slug,
      sortOrder: input.sortOrder,
      updatedAt: input.timestamp,
    })
    this.#folders.set(folder.id, clone(folder))
    return assetFolderWithCountDto(folder, 0)
  }

  async createFolderWithItems(input: CreateAssetFolderRecordInput & { assetItemIds: string[] }): Promise<AssetFolderWithCount | undefined> {
    const itemIds = [...new Set(input.assetItemIds)].filter(Boolean)
    if (itemIds.length === 0) {
      return undefined
    }
    if (
      itemIds.some((itemId) => {
        const item = this.#items.get(itemId)
        return !item || item.accountId !== input.accountId || item.deletedAt || item.status !== 'active'
      })
    ) {
      return undefined
    }
    const folder = await this.createFolder(input)
    for (const itemId of itemIds) {
      const item = this.#items.get(itemId)
      if (item) {
        this.#items.set(itemId, { ...item, folderId: folder.id, updatedAt: input.timestamp })
      }
    }
    return assetFolderWithCountDto(folder, itemIds.length)
  }

  async createItem(input: CreateAssetItemRecordInput): Promise<AssetLibraryItemWithRelations> {
    const item = assetItemDto({
      accountId: input.accountId,
      ...(input.addedByUserId ? { addedByUserId: input.addedByUserId } : {}),
      createdAt: input.timestamp,
      ...(input.description ? { description: input.description } : {}),
      displayName: input.displayName,
      ...(input.folderId ? { folderId: input.folderId } : {}),
      ...(input.homeProjectId ? { homeProjectId: input.homeProjectId } : {}),
      id: input.id,
      mediaObjectId: input.mediaObjectId,
      ...(input.sourceProjectId ? { sourceProjectId: input.sourceProjectId } : {}),
      ...(input.sourceProjectName ? { sourceProjectName: input.sourceProjectName } : {}),
      sourceRef: input.sourceRef,
      sourceType: input.sourceType,
      status: 'active',
      updatedAt: input.timestamp,
      usageCount: 0,
    })
    this.#items.set(item.id, clone(item))
    this.#itemTags.set(item.id, new Set(input.tagIds))
    this.refreshTagUsage(input.accountId)
    const created = await this.findItemById(input.accountId, item.id)
    if (!created) {
      throw new Error('Asset item was not loaded after creation.')
    }
    return created
  }

  async createTag(input: CreateAssetTagRecordInput): Promise<AssetTag> {
    const tag = assetTagDto({
      accountId: input.accountId,
      ...(input.color ? { color: input.color } : {}),
      createdAt: input.timestamp,
      ...(input.description ? { description: input.description } : {}),
      id: input.id,
      name: input.name,
      slug: input.slug,
      sortOrder: input.sortOrder,
      source: input.source,
      ...(input.systemKey ? { systemKey: input.systemKey } : {}),
      updatedAt: input.timestamp,
      usageCount: 0,
    })
    this.#tags.set(tag.id, clone(tag))
    return clone(tag)
  }

  async deleteFolder(input: { accountId: string; folderId: string; timestamp: string }): Promise<boolean> {
    const folder = this.#folders.get(input.folderId)
    if (!folder || folder.accountId !== input.accountId || folder.deletedAt) {
      return false
    }
    this.#folders.set(input.folderId, { ...folder, deletedAt: input.timestamp, updatedAt: input.timestamp })
    for (const [id, item] of this.#items.entries()) {
      if (item.accountId === input.accountId && item.folderId === input.folderId && !item.deletedAt) {
        const next = { ...item, updatedAt: input.timestamp }
        delete next.folderId
        this.#items.set(id, next)
      }
    }
    return true
  }

  async deleteItem(input: { accountId: string; itemId: string; timestamp: string }): Promise<boolean> {
    const item = this.#items.get(input.itemId)
    if (!item || item.accountId !== input.accountId || item.deletedAt) {
      return false
    }
    this.#items.set(input.itemId, { ...item, deletedAt: input.timestamp, status: 'deleted', updatedAt: input.timestamp })
    this.refreshTagUsage(input.accountId)
    return true
  }

  async deleteTag(input: { accountId: string; tagId: string; timestamp: string }): Promise<boolean> {
    const tag = this.#tags.get(input.tagId)
    if (!tag || tag.accountId !== input.accountId || tag.deletedAt) {
      return false
    }
    this.#tags.set(input.tagId, { ...tag, deletedAt: input.timestamp, updatedAt: input.timestamp, usageCount: 0 })
    return true
  }

  async ensureSystemTags(accountId: string, timestamp: string): Promise<AssetTag[]> {
    for (const item of defaultAssetSystemTags) {
      const existing = [...this.#tags.values()].find((tag) => tag.accountId === accountId && tag.slug === item.slug)
      if (existing) {
        this.#tags.set(existing.id, {
          ...existing,
          color: item.color,
          name: item.name,
          sortOrder: item.sortOrder,
          source: 'system',
          systemKey: item.key,
          updatedAt: timestamp,
        })
        continue
      }
      await this.createTag({
        accountId,
        color: item.color,
        id: `asset_tag_${item.key}_${crypto.randomUUID()}`,
        name: item.name,
        slug: item.slug,
        sortOrder: item.sortOrder,
        source: 'system',
        systemKey: item.key,
        timestamp,
      })
    }
    return this.listTags(accountId)
  }

  async findFolderById(accountId: string, folderId: string): Promise<AssetFolderWithCount | undefined> {
    const folder = this.#folders.get(folderId)
    return folder?.accountId === accountId && !folder.deletedAt ? assetFolderWithCountDto(clone(folder), this.folderCount(accountId, folderId)) : undefined
  }

  async findFolderBySlug(accountId: string, slug: string): Promise<AssetLibraryFolder | undefined> {
    const folder = [...this.#folders.values()].find((item) => item.accountId === accountId && item.slug === slug && !item.deletedAt)
    return folder ? clone(folder) : undefined
  }

  async findItemById(accountId: string, itemId: string): Promise<AssetLibraryItemWithRelations | undefined> {
    const item = this.#items.get(itemId)
    return item?.accountId === accountId && !item.deletedAt ? this.itemWithRelations(item, { activeOnly: true }) : undefined
  }

  async findTagById(accountId: string, tagId: string): Promise<AssetTag | undefined> {
    const tag = this.#tags.get(tagId)
    return tag?.accountId === accountId && !tag.deletedAt ? clone(tag) : undefined
  }

  async findTagBySlug(accountId: string, slug: string): Promise<AssetTag | undefined> {
    const tag = [...this.#tags.values()].find((item) => item.accountId === accountId && item.slug === slug && !item.deletedAt)
    return tag ? clone(tag) : undefined
  }

  async hasSystemTags(accountId: string): Promise<boolean> {
    const expectedKeys = defaultAssetSystemTags.map((tag) => tag.key)
    const existingKeys = new Set(
      [...this.#tags.values()]
        .filter((tag) => tag.accountId === accountId && tag.source === 'system' && !tag.deletedAt)
        .map((tag) => tag.systemKey)
        .filter(Boolean),
    )
    return expectedKeys.every((key) => existingKeys.has(key))
  }

  async listFolders(accountId: string, q?: string): Promise<AssetFolderWithCount[]> {
    const normalized = q?.toLowerCase()
    return [...this.#folders.values()]
      .filter((folder) => folder.accountId === accountId && !folder.deletedAt)
      .filter((folder) => !normalized || folder.name.toLowerCase().includes(normalized) || folder.slug.includes(normalized))
      .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
      .map((folder) => assetFolderWithCountDto(clone(folder), this.folderCount(accountId, folder.id)))
  }

  async listItems(input: ListAssetItemsInput): Promise<ListAssetItemsResult> {
    const itemCandidates = await Promise.all(
      [...this.#items.values()]
        .filter((item) => item.accountId === input.accountId && !item.deletedAt && item.status === 'active')
        .map((item) => this.itemWithRelations(item)),
    )
    let items = itemCandidates.filter((item): item is AssetLibraryItemWithRelations => Boolean(item))
    items = items.filter((item) => {
      if (input.folderId && item.folderId !== input.folderId) return false
      if (input.homeProjectId && item.homeProjectId !== input.homeProjectId) return false
      if (input.sourceProjectId && item.sourceProjectId !== input.sourceProjectId) return false
      if (input.sourceType && item.sourceType !== input.sourceType) return false
      if (input.kind && item.mediaObject.kind !== input.kind) return false
      if (input.favoriteOnly && !item.favoritedAt) return false
      if (input.tagIds.length > 0) {
        const itemTagIds = new Set(item.tags.map((tag) => tag.id))
        const matches = input.tagMatch === 'any'
          ? input.tagIds.some((tagId) => itemTagIds.has(tagId))
          : input.tagIds.every((tagId) => itemTagIds.has(tagId))
        if (!matches) return false
      }
      if (input.q) {
        const q = input.q.toLowerCase()
        return (
          includesText(item.displayName, q) ||
          includesText(item.description, q) ||
          includesText(item.sourceProjectId, q) ||
          includesText(item.sourceProjectName, q) ||
          includesText(item.mediaObject.kind, q) ||
          includesText(item.mediaObject.mimeType, q) ||
          item.tags.some((tag) => includesText(tag.name, q) || includesText(tag.slug, q)) ||
          sourceText(item.sourceRef).includes(q) ||
          (item.mediaObject.metadata ? sourceText(item.mediaObject.metadata).includes(q) : false)
        )
      }
      return true
    })
    const sorted = items.sort((left, right) => {
      if (input.sort === 'relevance' || input.q) {
        return fakeItemQueryScore(right, input.q) - fakeItemQueryScore(left, input.q) || right.updatedAt.localeCompare(left.updatedAt)
      }
      if (input.sort === 'name') return left.displayName.localeCompare(right.displayName)
      if (input.sort === 'used') {
        return (
          Date.parse(right.lastUsedAt ?? right.updatedAt) - Date.parse(left.lastUsedAt ?? left.updatedAt) ||
          right.usageCount - left.usageCount ||
          right.id.localeCompare(left.id)
        )
      }
      return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    })
    const offset = decodeFakeCursor(input.cursor)
    const pageItems = sorted.slice(offset, offset + input.limit)
    const nextOffset = offset + input.limit
    return {
      items: pageItems,
      ...(nextOffset < sorted.length ? { nextCursor: encodeFakeCursor(nextOffset) } : {}),
    }
  }

  async listTags(accountId: string, q?: string): Promise<AssetTag[]> {
    const normalized = q?.toLowerCase()
    return [...this.#tags.values()]
      .filter((tag) => tag.accountId === accountId && !tag.deletedAt)
      .filter((tag) => !normalized || tag.name.toLowerCase().includes(normalized) || tag.slug.includes(normalized))
      .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
      .map(clone)
  }

  async removeTagFromItem(input: { accountId: string; itemId: string; tagId: string; timestamp: string }): Promise<AssetLibraryItemWithRelations | undefined> {
    const item = this.#items.get(input.itemId)
    if (!item || item.accountId !== input.accountId || item.deletedAt) {
      return undefined
    }
    this.#itemTags.get(input.itemId)?.delete(input.tagId)
    this.touchItem(input.itemId, input.timestamp)
    this.refreshTagUsage(input.accountId)
    const updatedItem = this.#items.get(input.itemId)
    return updatedItem ? this.itemWithRelations(updatedItem) : undefined
  }

  async updateFolder(input: { accountId: string; folderId: string; name: string; slug: string; timestamp: string }): Promise<AssetFolderWithCount | undefined> {
    const folder = this.#folders.get(input.folderId)
    if (!folder || folder.accountId !== input.accountId || folder.deletedAt) {
      return undefined
    }
    const updated = { ...folder, name: input.name, slug: input.slug, updatedAt: input.timestamp }
    this.#folders.set(folder.id, updated)
    return assetFolderWithCountDto(clone(updated), this.folderCount(input.accountId, folder.id))
  }

  async updateItem(input: {
    accountId: string
    description?: string | null
    displayName?: string
    favoritedAt?: string | null
    folderId?: string | null
    homeProjectId?: string | null
    itemId: string
    status?: 'active' | 'archived'
    tagIds?: string[]
    timestamp: string
  }): Promise<AssetLibraryItemWithRelations | undefined> {
    const item = this.#items.get(input.itemId)
    if (!item || item.accountId !== input.accountId || item.deletedAt) {
      return undefined
    }
    const updated: AssetLibraryItem = {
      ...item,
      ...(input.description !== undefined ? (input.description ? { description: input.description } : {}) : {}),
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.favoritedAt !== undefined ? (input.favoritedAt ? { favoritedAt: input.favoritedAt } : {}) : {}),
      ...(input.folderId !== undefined ? (input.folderId ? { folderId: input.folderId } : {}) : {}),
      ...(input.homeProjectId !== undefined ? (input.homeProjectId ? { homeProjectId: input.homeProjectId } : {}) : {}),
      ...(input.status ? { status: input.status } : {}),
      updatedAt: input.timestamp,
    }
    if (input.description === null) delete updated.description
    if (input.favoritedAt === null) delete updated.favoritedAt
    if (input.folderId === null) delete updated.folderId
    if (input.homeProjectId === null) delete updated.homeProjectId
    this.#items.set(input.itemId, updated)
    if (input.tagIds) this.#itemTags.set(input.itemId, new Set(input.tagIds))
    this.refreshTagUsage(input.accountId)
    return this.itemWithRelations(updated)
  }

  async updateTag(input: {
    accountId: string
    color?: string | null
    description?: string | null
    name?: string
    slug?: string
    tagId: string
    timestamp: string
  }): Promise<AssetTag | undefined> {
    const tag = this.#tags.get(input.tagId)
    if (!tag || tag.accountId !== input.accountId || tag.deletedAt) {
      return undefined
    }
    const updated: AssetTag = {
      ...tag,
      ...(input.color !== undefined ? (input.color ? { color: input.color } : {}) : {}),
      ...(input.description !== undefined ? (input.description ? { description: input.description } : {}) : {}),
      ...(input.name ? { name: input.name } : {}),
      ...(input.slug ? { slug: input.slug } : {}),
      updatedAt: input.timestamp,
    }
    if (input.color === null) delete updated.color
    if (input.description === null) delete updated.description
    this.#tags.set(tag.id, updated)
    return clone(updated)
  }

  async useItem(input: { accountId: string; itemId: string; timestamp: string }): Promise<AssetLibraryItemWithRelations | undefined> {
    const item = this.#items.get(input.itemId)
    if (!item || item.accountId !== input.accountId || item.deletedAt || item.status !== 'active') {
      return undefined
    }
    this.#items.set(item.id, {
      ...item,
      lastUsedAt: input.timestamp,
      updatedAt: input.timestamp,
      usageCount: item.usageCount + 1,
    })
    return this.findItemById(input.accountId, input.itemId)
  }

  private folderCount(accountId: string, folderId: string): number {
    return [...this.#items.values()].filter((item) => item.accountId === accountId && item.folderId === folderId && item.status === 'active' && !item.deletedAt).length
  }

  private async itemWithRelations(
    item: AssetLibraryItem,
    options: { activeOnly?: boolean } = {},
  ): Promise<AssetLibraryItemWithRelations | undefined> {
    const mediaObject = await this.mediaObjectService.getMediaObject(item.accountId, item.mediaObjectId).catch(() => undefined)
    if (!mediaObject || (options.activeOnly && item.status !== 'active') || mediaObject.status !== 'ready' || mediaObject.deletedAt) {
      return undefined
    }
    const folder = item.folderId ? this.#folders.get(item.folderId) : undefined
    const tags = [...(this.#itemTags.get(item.id) ?? new Set<string>())]
      .map((tagId) => this.#tags.get(tagId))
      .filter((tag): tag is AssetTag => Boolean(tag && !tag.deletedAt))
    return assetItemWithRelationsDto(clone(item), {
      ...(folder && !folder.deletedAt ? { folder: clone(folder) } : {}),
      mediaObject,
      tags: tags.map(clone),
    })
  }

  private refreshTagUsage(accountId: string): void {
    const counts = new Map<string, number>()
    for (const item of this.#items.values()) {
      if (item.accountId !== accountId || item.deletedAt || item.status !== 'active') continue
      for (const tagId of this.#itemTags.get(item.id) ?? []) {
        counts.set(tagId, (counts.get(tagId) ?? 0) + 1)
      }
    }
    for (const [id, tag] of this.#tags.entries()) {
      if (tag.accountId === accountId && !tag.deletedAt) {
        this.#tags.set(id, { ...tag, usageCount: counts.get(id) ?? 0 })
      }
    }
  }

  private touchItem(itemId: string, timestamp: string): void {
    const item = this.#items.get(itemId)
    if (item) this.#items.set(itemId, { ...item, updatedAt: timestamp })
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

  async deleteUpdates(workflowId: string, updateIds?: readonly string[]): Promise<void> {
    if (!updateIds) {
      this.#updates.delete(workflowId)
      return
    }
    if (updateIds.length === 0) {
      return
    }
    const deletedIds = new Set(updateIds)
    this.#updates.set(
      workflowId,
      (this.#updates.get(workflowId) ?? []).filter((update) => !deletedIds.has(update.id)),
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

  async saveSnapshot(input: WorkflowYjsSnapshotRecord): Promise<boolean> {
    const current = this.#snapshots.get(input.workflowId)
    if (input.expectedVersion !== undefined && current?.version !== input.expectedVersion) {
      return false
    }

    this.#snapshots.set(input.workflowId, {
      snapshotBin: new Uint8Array(input.snapshotBin),
      stateVector: new Uint8Array(input.stateVector),
      version: input.version,
      workflowId: input.workflowId,
    })
    return true
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

  async updateName(id: string, name: string, timestamp: string): Promise<WorkflowSummary | undefined> {
    const existing = this.#workflows.get(id)
    if (!existing) {
      return undefined
    }

    const workflow = workflowSummaryDto({
      accountId: existing.accountId,
      createdAt: existing.createdAt,
      id: existing.id,
      name,
      updatedAt: timestamp,
      version: existing.version,
    })
    this.#workflows.set(workflow.id, cloneWorkflowSummary(workflow))
    return cloneWorkflowSummary(workflow)
  }

}

export class FakeProjectRepository implements ProjectRepository {
  readonly #memberships = new Map<string, ProjectWorkflow>()
  readonly #projects = new Map<string, Project>()

  constructor(private readonly workflowDefinitions: WorkflowDefinitionRepository) {}

  async addWorkflow(input: {
    accountId: string
    projectId: string
    timestamp: string
    workflowId: string
  }): Promise<ProjectWithWorkflows | undefined> {
    const project = this.#projects.get(input.projectId)
    const workflow = await this.workflowDefinitions.findById(input.workflowId)
    if (!project || project.accountId !== input.accountId || !workflow || workflow.accountId !== input.accountId) {
      return undefined
    }
    if (this.workflowMembership(input.workflowId)) {
      throw new Error('Canvas is already in a project.')
    }

    const membership = projectWorkflowDto({
      createdAt: input.timestamp,
      projectId: input.projectId,
      sortOrder: this.nextSortOrder(input.projectId),
      updatedAt: input.timestamp,
      workflowId: input.workflowId,
    })
    this.#memberships.set(this.membershipKey(input.projectId, input.workflowId), membership)
    this.#projects.set(project.id, {
      ...project,
      updatedAt: input.timestamp,
    })
    return this.findById(input.accountId, input.projectId)
  }

  async create(input: CreateProjectRecordInput & { workflowIds: string[] }): Promise<ProjectWithWorkflows> {
    for (const workflowId of input.workflowIds) {
      const workflow = await this.workflowDefinitions.findById(workflowId)
      if (!workflow || workflow.accountId !== input.accountId) {
        throw new Error('One or more workflows were not found.')
      }
      if (this.workflowMembership(workflowId)) {
        throw new Error('Canvas is already in a project.')
      }
    }

    const project = projectDto({
      accountId: input.accountId,
      createdAt: input.timestamp,
      id: input.id,
      name: input.name,
      updatedAt: input.timestamp,
    })
    this.#projects.set(project.id, project)
    for (const [index, workflowId] of input.workflowIds.entries()) {
      const membership = projectWorkflowDto({
        createdAt: input.timestamp,
        projectId: project.id,
        sortOrder: index,
        updatedAt: input.timestamp,
        workflowId,
      })
      this.#memberships.set(this.membershipKey(project.id, workflowId), membership)
    }

    const created = await this.findById(input.accountId, project.id)
    if (!created) {
      throw new Error('Project was not loaded after creation.')
    }
    return created
  }

  async delete(input: { accountId: string; projectId: string; timestamp: string }): Promise<boolean> {
    const project = this.#projects.get(input.projectId)
    if (!project || project.accountId !== input.accountId) {
      return false
    }
    this.#projects.delete(input.projectId)
    for (const [key, membership] of this.#memberships.entries()) {
      if (membership.projectId === input.projectId) {
        this.#memberships.delete(key)
      }
    }
    return true
  }

  async findById(accountId: string, projectId: string): Promise<ProjectWithWorkflows | undefined> {
    const project = this.#projects.get(projectId)
    if (!project || project.accountId !== accountId) {
      return undefined
    }

    return cloneProjectWithWorkflows(projectWithWorkflowsDto(project, await this.workflowsForProject(projectId)))
  }

  async findWorkflowMembership(accountId: string, workflowId: string): Promise<ProjectWorkflow | undefined> {
    const membership = this.workflowMembership(workflowId)
    if (!membership) {
      return undefined
    }
    const project = this.#projects.get(membership.projectId)
    const workflow = await this.workflowDefinitions.findById(workflowId)
    return project?.accountId === accountId && workflow?.accountId === accountId ? clone(membership) : undefined
  }

  async listOverview(accountId: string): Promise<{
    projects: ProjectWithWorkflows[]
    ungroupedWorkflows: WorkflowSummary[]
  }> {
    const projects = await Promise.all(
      [...this.#projects.values()]
        .filter((project) => project.accountId === accountId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map((project) => this.findById(accountId, project.id)),
    )
    const memberWorkflowIds = new Set(
      [...this.#memberships.values()]
        .filter((membership) => this.#projects.get(membership.projectId)?.accountId === accountId)
        .map((membership) => membership.workflowId),
    )
    const ungroupedWorkflows = (await this.workflowDefinitions.list(accountId))
      .filter((workflow) => !memberWorkflowIds.has(workflow.id))
      .map(cloneWorkflowSummary)

    return {
      projects: projects.filter((project: ProjectWithWorkflows | undefined): project is ProjectWithWorkflows => Boolean(project)),
      ungroupedWorkflows,
    }
  }

  async removeWorkflow(input: { accountId: string; projectId: string; workflowId: string }): Promise<boolean> {
    const project = this.#projects.get(input.projectId)
    if (!project || project.accountId !== input.accountId) {
      return false
    }
    return this.#memberships.delete(this.membershipKey(input.projectId, input.workflowId))
  }

  async update(input: {
    accountId: string
    name: string
    projectId: string
    timestamp: string
  }): Promise<ProjectWithWorkflows | undefined> {
    const project = this.#projects.get(input.projectId)
    if (!project || project.accountId !== input.accountId) {
      return undefined
    }
    this.#projects.set(project.id, {
      ...project,
      name: input.name,
      updatedAt: input.timestamp,
    })
    return this.findById(input.accountId, input.projectId)
  }

  private membershipKey(projectId: string, workflowId: string): string {
    return `${projectId}:${workflowId}`
  }

  private nextSortOrder(projectId: string): number {
    const sortOrders = [...this.#memberships.values()]
      .filter((membership) => membership.projectId === projectId)
      .map((membership) => membership.sortOrder)
    return sortOrders.length > 0 ? Math.max(...sortOrders) + 1 : 0
  }

  private async workflowsForProject(projectId: string): Promise<WorkflowSummary[]> {
    const workflows = await Promise.all(
      [...this.#memberships.values()]
        .filter((membership) => membership.projectId === projectId)
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((membership) => this.workflowDefinitions.findById(membership.workflowId)),
    )
    return workflows.filter((workflow): workflow is WorkflowSummary => Boolean(workflow)).map(cloneWorkflowSummary)
  }

  private workflowMembership(workflowId: string): ProjectWorkflow | undefined {
    return [...this.#memberships.values()].find((membership) => membership.workflowId === workflowId)
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
}
