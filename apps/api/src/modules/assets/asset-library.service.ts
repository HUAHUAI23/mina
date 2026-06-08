import type {
  AssetLibraryItemWithRelations,
  AssetTag,
  CreateAssetFolderWithItemsInput,
  CreateAssetFolderInput,
  CreateAssetFromMediaObjectInput,
  CreateAssetTagInput,
  ListAssetLibraryItemsQuery,
  ListAssetFoldersQuery,
  ListAssetTagsQuery,
  UpdateAssetFolderInput,
  UpdateAssetLibraryItemInput,
  UpdateAssetTagInput,
} from '@mina/contracts/modules/assets'
import type { ResourceKind } from '@mina/contracts/modules/tasks'

import { HttpError } from '../../lib/http/http-error'
import type { MediaObjectService } from '../media/media-object.service'
import type { ProjectRepository } from '../projects/projects.repository'
import type { AssetLibraryRepository } from './asset-library.repository'

const nowIso = (): string => new Date().toISOString()
const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`
const currentSortOrder = (): number => Math.floor(Date.now() / 1000)
const MAX_UNIQUE_SLUG_ATTEMPTS = 3

export interface CreateUploadedAssetInput {
  accountId: string
  addedByUserId: string
  body: Uint8Array
  description?: string
  displayName?: string
  fileName: string
  folderId?: string | null
  homeProjectId?: string | null
  kind: ResourceKind
  mimeType?: string
  tagIds: string[]
}

const isPresent = (value: string | null | undefined): value is string => Boolean(value?.trim())

const normalizeNullable = (value: string | null | undefined): string | undefined =>
  isPresent(value) ? value.trim() : undefined

const slugify = (value: string): string =>
  value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{Letter}\p{Number}-]+/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '') || `item-${crypto.randomUUID().slice(0, 8)}`

const uniqueValues = (values: string[]): string[] => Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))

const errorCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object') {
    return undefined
  }
  if ('code' in error && typeof error.code === 'string') {
    return error.code
  }
  if ('cause' in error) {
    return errorCode(error.cause)
  }
  return undefined
}

const isUniqueConstraintError = (error: unknown): boolean => errorCode(error) === '23505'

export class AssetLibraryService {
  constructor(
    private readonly assets: AssetLibraryRepository,
    private readonly mediaObjectService: MediaObjectService,
    private readonly projects: ProjectRepository,
  ) {}

  async addTag(accountId: string, itemId: string, tagId: string): Promise<AssetLibraryItemWithRelations> {
    await this.requireTag(accountId, tagId)
    const item = await this.assets.addTagToItem({ accountId, itemId, tagId, timestamp: nowIso() })
    if (!item) {
      throw this.assetNotFound()
    }
    return item
  }

  async createFolder(accountId: string, userId: string, input: CreateAssetFolderInput) {
    return this.withUniqueSlugRetry(async () => {
      const timestamp = nowIso()
      return this.assets.createFolder({
        accountId,
        createdByUserId: userId,
        id: createId('asset_folder'),
        name: input.name,
        slug: await this.uniqueFolderSlug(accountId, input.name),
        sortOrder: currentSortOrder(),
        timestamp,
      })
    })
  }

  async createFolderWithItems(accountId: string, userId: string, input: CreateAssetFolderWithItemsInput) {
    const folder = await this.withUniqueSlugRetry(async () => {
      const timestamp = nowIso()
      return this.assets.createFolderWithItems({
        accountId,
        assetItemIds: uniqueValues(input.assetItemIds),
        createdByUserId: userId,
        id: createId('asset_folder'),
        name: input.name,
        slug: await this.uniqueFolderSlug(accountId, input.name),
        sortOrder: currentSortOrder(),
        timestamp,
      })
    })
    if (!folder) {
      throw this.assetNotFound()
    }
    return folder
  }

  async createTag(accountId: string, input: CreateAssetTagInput): Promise<AssetTag> {
    await this.ensureSystemTags(accountId)
    return this.withUniqueSlugRetry(async () =>
      this.assets.createTag({
        accountId,
        ...(input.color ? { color: input.color } : {}),
        ...(input.description ? { description: input.description } : {}),
        id: createId('asset_tag'),
        name: input.name,
        slug: await this.uniqueTagSlug(accountId, input.name),
        sortOrder: currentSortOrder(),
        source: 'custom',
        timestamp: nowIso(),
      }),
    )
  }

  async createUploadedAsset(input: CreateUploadedAssetInput): Promise<AssetLibraryItemWithRelations> {
    await this.ensureSystemTags(input.accountId)
    await this.validateFolder(input.accountId, input.folderId)
    await this.validateHomeProject(input.accountId, input.homeProjectId)
    await this.validateTags(input.accountId, input.tagIds)
    const mediaObject = await this.mediaObjectService.createFromBuffer({
      accountId: input.accountId,
      body: input.body,
      kind: input.kind,
      ...(input.mimeType ? { mimeType: input.mimeType } : {}),
      origin: 'user_upload',
      purpose: 'asset_library',
      retention: 'library',
      metadata: {
        originalFilename: input.fileName,
      },
    })
    try {
      const displayName = input.displayName?.trim() || input.fileName || mediaObject.id
      const folderId = normalizeNullable(input.folderId)
      const homeProjectId = normalizeNullable(input.homeProjectId)
      return await this.assets.createItem({
        accountId: input.accountId,
        addedByUserId: input.addedByUserId,
        ...(input.description ? { description: input.description } : {}),
        displayName,
        ...(folderId ? { folderId } : {}),
        ...(homeProjectId ? { homeProjectId } : {}),
        id: createId('asset'),
        mediaObjectId: mediaObject.id,
        sourceRef: {
          originalFilename: input.fileName,
          uploadedByUserId: input.addedByUserId,
        },
        sourceType: 'local_upload',
        tagIds: uniqueValues(input.tagIds),
        timestamp: nowIso(),
      })
    } catch (error) {
      await this.mediaObjectService.softDelete(input.accountId, mediaObject.id)
      throw error
    }
  }

  async createFromMediaObject(
    accountId: string,
    userId: string,
    input: CreateAssetFromMediaObjectInput,
  ): Promise<AssetLibraryItemWithRelations> {
    await this.ensureSystemTags(accountId)
    await this.validateFolder(accountId, input.folderId)
    await this.validateHomeProject(accountId, input.homeProjectId)
    await this.validateTags(accountId, input.tagIds)
    const mediaObject = await this.mediaObjectService.promoteToLibrary(accountId, input.mediaObjectId)
    const displayName = input.displayName?.trim() || this.defaultDisplayName(mediaObject.id, input.sourceRef)
    const folderId = normalizeNullable(input.folderId)
    const homeProjectId = normalizeNullable(input.homeProjectId)
    const sourceProjectId = normalizeNullable(input.sourceProjectId)
    const sourceProjectName = normalizeNullable(input.sourceProjectName)

    return this.assets.createItem({
      accountId,
      addedByUserId: userId,
      ...(input.description ? { description: input.description } : {}),
      displayName,
      ...(folderId ? { folderId } : {}),
      ...(homeProjectId ? { homeProjectId } : {}),
      id: createId('asset'),
      mediaObjectId: mediaObject.id,
      ...(sourceProjectId ? { sourceProjectId } : {}),
      ...(sourceProjectName ? { sourceProjectName } : {}),
      sourceRef: input.sourceRef ?? {},
      sourceType: input.sourceType,
      tagIds: uniqueValues(input.tagIds),
      timestamp: nowIso(),
    })
  }

  async deleteFolder(accountId: string, folderId: string): Promise<void> {
    const deleted = await this.assets.deleteFolder({ accountId, folderId, timestamp: nowIso() })
    if (!deleted) {
      throw this.folderNotFound()
    }
  }

  async deleteItem(accountId: string, itemId: string): Promise<void> {
    const deleted = await this.assets.deleteItem({ accountId, itemId, timestamp: nowIso() })
    if (!deleted) {
      throw this.assetNotFound()
    }
  }

  async deleteTag(accountId: string, tagId: string): Promise<void> {
    const tag = await this.requireTag(accountId, tagId)
    if (tag.source === 'system') {
      throw new HttpError(409, 'ASSET_SYSTEM_TAG_IMMUTABLE', {
        fallbackMessage: 'System asset tags cannot be deleted.',
        messageKey: 'api_error_asset_system_tag_immutable',
      })
    }
    const deleted = await this.assets.deleteTag({ accountId, tagId, timestamp: nowIso() })
    if (!deleted) {
      throw this.tagNotFound()
    }
  }

  async getItem(accountId: string, itemId: string): Promise<AssetLibraryItemWithRelations> {
    const item = await this.assets.findItemById(accountId, itemId)
    if (!item) {
      throw this.assetNotFound()
    }
    return item
  }

  async listFolders(accountId: string, query: ListAssetFoldersQuery) {
    return {
      items: await this.assets.listFolders(accountId, query.q),
    }
  }

  async listLibrary(accountId: string, query: ListAssetLibraryItemsQuery) {
    const folderId = normalizeNullable(query.folderId)
    const homeProjectId = normalizeNullable(query.homeProjectId)
    const sourceProjectId = normalizeNullable(query.sourceProjectId)
    const tagIds = query.tagIds ? uniqueValues(query.tagIds) : []
    const hasAssetOnlyFilters = Boolean(
      homeProjectId ||
        sourceProjectId ||
        query.kind ||
        query.sourceType ||
        query.favoriteOnly ||
        tagIds.length > 0,
    )
    const listResult = await this.assets.listItems({
      accountId,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.favoriteOnly !== undefined ? { favoriteOnly: query.favoriteOnly } : {}),
      ...(folderId ? { folderId } : {}),
      ...(homeProjectId ? { homeProjectId } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      limit: query.limit,
      ...(query.q ? { q: query.q } : {}),
      sort: query.sort,
      ...(sourceProjectId ? { sourceProjectId } : {}),
      ...(query.sourceType ? { sourceType: query.sourceType } : {}),
      tagIds,
      tagMatch: query.tagMatch,
    })
    return {
      folders: folderId || hasAssetOnlyFilters ? [] : await this.assets.listFolders(accountId, query.q),
      items: listResult.items,
      ...(listResult.nextCursor ? { nextCursor: listResult.nextCursor } : {}),
    }
  }

  async listTags(accountId: string, query: ListAssetTagsQuery) {
    await this.ensureSystemTags(accountId)
    return {
      items: await this.assets.listTags(accountId, query.q),
    }
  }

  async seedAccount(accountId: string): Promise<void> {
    await this.ensureSystemTags(accountId)
  }

  async removeTag(accountId: string, itemId: string, tagId: string): Promise<AssetLibraryItemWithRelations> {
    await this.requireTag(accountId, tagId)
    const item = await this.assets.removeTagFromItem({ accountId, itemId, tagId, timestamp: nowIso() })
    if (!item) {
      throw this.assetNotFound()
    }
    return item
  }

  async updateFolder(accountId: string, folderId: string, input: UpdateAssetFolderInput) {
    const folder = await this.withUniqueSlugRetry(async () =>
      this.assets.updateFolder({
        accountId,
        folderId,
        name: input.name,
        slug: await this.uniqueFolderSlug(accountId, input.name, folderId),
        timestamp: nowIso(),
      }),
    )
    if (!folder) {
      throw this.folderNotFound()
    }
    return folder
  }

  async updateItem(
    accountId: string,
    itemId: string,
    input: UpdateAssetLibraryItemInput,
  ): Promise<AssetLibraryItemWithRelations> {
    await this.validateFolder(accountId, input.folderId)
    await this.validateHomeProject(accountId, input.homeProjectId)
    if (input.tagIds) {
      await this.validateTags(accountId, input.tagIds)
    }
    const timestamp = nowIso()
    const item = await this.assets.updateItem({
      accountId,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.favorited !== undefined ? { favoritedAt: input.favorited ? timestamp : null } : {}),
      ...(input.folderId !== undefined ? { folderId: normalizeNullable(input.folderId) ?? null } : {}),
      ...(input.homeProjectId !== undefined ? { homeProjectId: normalizeNullable(input.homeProjectId) ?? null } : {}),
      itemId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.tagIds ? { tagIds: uniqueValues(input.tagIds) } : {}),
      timestamp,
    })
    if (!item) {
      throw this.assetNotFound()
    }
    return item
  }

  async updateTag(accountId: string, tagId: string, input: UpdateAssetTagInput): Promise<AssetTag> {
    const tag = await this.requireTag(accountId, tagId)
    if (tag.source === 'system' && input.name !== undefined) {
      throw new HttpError(409, 'ASSET_SYSTEM_TAG_IMMUTABLE', {
        fallbackMessage: 'System asset tags cannot be renamed.',
        messageKey: 'api_error_asset_system_tag_immutable',
      })
    }
    const updated = await this.withUniqueSlugRetry(async () =>
      this.assets.updateTag({
        accountId,
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.name !== undefined ? { name: input.name, slug: await this.uniqueTagSlug(accountId, input.name, tagId) } : {}),
        tagId,
        timestamp: nowIso(),
      }),
    )
    if (!updated) {
      throw this.tagNotFound()
    }
    return updated
  }

  async useItem(accountId: string, itemId: string): Promise<AssetLibraryItemWithRelations> {
    const item = await this.assets.useItem({ accountId, itemId, timestamp: nowIso() })
    if (!item) {
      throw this.assetNotFound()
    }
    return item
  }

  private assetNotFound(): HttpError {
    return new HttpError(404, 'ASSET_LIBRARY_ITEM_NOT_FOUND', {
      fallbackMessage: 'Asset not found.',
      messageKey: 'api_error_asset_library_item_not_found',
    })
  }

  private defaultDisplayName(mediaObjectId: string, sourceRef: Record<string, unknown> | undefined): string {
    const originalFilename = sourceRef?.originalFilename
    return typeof originalFilename === 'string' && originalFilename.trim() ? originalFilename.trim() : mediaObjectId
  }

  private async ensureSystemTags(accountId: string): Promise<AssetTag[]> {
    if (await this.assets.hasSystemTags(accountId)) {
      return this.assets.listTags(accountId)
    }
    return this.assets.ensureSystemTags(accountId, nowIso())
  }

  private folderNotFound(): HttpError {
    return new HttpError(404, 'ASSET_FOLDER_NOT_FOUND', {
      fallbackMessage: 'Asset folder not found.',
      messageKey: 'api_error_asset_folder_not_found',
    })
  }

  private async requireTag(accountId: string, tagId: string): Promise<AssetTag> {
    const tag = await this.assets.findTagById(accountId, tagId)
    if (!tag) {
      throw this.tagNotFound()
    }
    return tag
  }

  private tagNotFound(): HttpError {
    return new HttpError(404, 'ASSET_TAG_NOT_FOUND', {
      fallbackMessage: 'Asset tag not found.',
      messageKey: 'api_error_asset_tag_not_found',
    })
  }

  private async uniqueFolderSlug(accountId: string, name: string, ignoreFolderId?: string): Promise<string> {
    const base = slugify(name)
    for (let index = 0; index < 100; index += 1) {
      const slug = index === 0 ? base : `${base}-${index + 1}`
      const existing = await this.assets.findFolderBySlug(accountId, slug)
      if (!existing || existing.id === ignoreFolderId) {
        return slug
      }
    }
    return `${base}-${crypto.randomUUID().slice(0, 8)}`
  }

  private async uniqueTagSlug(accountId: string, name: string, ignoreTagId?: string): Promise<string> {
    const base = slugify(name)
    for (let index = 0; index < 100; index += 1) {
      const slug = index === 0 ? base : `${base}-${index + 1}`
      const existing = await this.assets.findTagBySlug(accountId, slug)
      if (!existing || existing.id === ignoreTagId) {
        return slug
      }
    }
    return `${base}-${crypto.randomUUID().slice(0, 8)}`
  }

  private async validateFolder(accountId: string, folderId: string | null | undefined): Promise<void> {
    const normalized = normalizeNullable(folderId)
    if (!normalized) {
      return
    }
    const folder = await this.assets.findFolderById(accountId, normalized)
    if (!folder) {
      throw this.folderNotFound()
    }
  }

  private async validateHomeProject(accountId: string, projectId: string | null | undefined): Promise<void> {
    const normalized = normalizeNullable(projectId)
    if (!normalized) {
      return
    }
    const project = await this.projects.findById(accountId, normalized)
    if (!project) {
      throw new HttpError(404, 'PROJECT_NOT_FOUND', {
        fallbackMessage: 'Project not found.',
        messageKey: 'api_error_project_not_found',
      })
    }
  }

  private async validateTags(accountId: string, tagIds: string[]): Promise<void> {
    for (const tagId of uniqueValues(tagIds)) {
      await this.requireTag(accountId, tagId)
    }
  }

  private async withUniqueSlugRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < MAX_UNIQUE_SLUG_ATTEMPTS; attempt += 1) {
      try {
        return await operation()
      } catch (error) {
        if (!isUniqueConstraintError(error) || attempt === MAX_UNIQUE_SLUG_ATTEMPTS - 1) {
          throw error
        }
      }
    }
    throw new Error('Unique slug retry did not complete.')
  }
}
