
import type {
  AssetFolderWithCount,
  AssetLibraryFolder,
  AssetLibraryItem,
  AssetLibraryItemWithRelations,
  AssetTag,
} from '@mina/contracts/modules/assets'

import { defaultAssetSystemTags } from '../../../modules/assets/asset-library-defaults'
import {
  assetFolderDto,
  assetFolderWithCountDto,
  assetItemDto,
  assetItemWithRelationsDto,
  assetTagDto,
} from '../../../modules/assets/asset-library-mappers'
import type {
  AssetLibraryRepository,
  CreateAssetFolderRecordInput,
  CreateAssetItemRecordInput,
  CreateAssetTagRecordInput,
  ListAssetItemsInput,
  ListAssetItemsResult,
} from '../../../modules/assets/asset-library.repository'
import type { MediaObjectService } from '../../../modules/media/media-object.service'
import { clone } from '../shared/clone'

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
