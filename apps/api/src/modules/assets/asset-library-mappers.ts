import {
  AssetFolderWithCountSchema,
  AssetLibraryFolderSchema,
  AssetLibraryItemSchema,
  AssetLibraryItemWithRelationsSchema,
  AssetTagSchema,
  type AssetFolderWithCount,
  type AssetLibraryFolder,
  type AssetLibraryItem,
  type AssetLibraryItemWithRelations,
  type AssetTag,
} from '@mina/contracts/modules/assets'
import type { MediaObject } from '@mina/contracts/modules/media/media-object'

export const toIso = (value: Date): string => value.toISOString()

export const assetFolderDto = (input: {
  accountId: string
  createdAt: string
  createdByUserId?: string
  deletedAt?: string
  id: string
  name: string
  slug: string
  sortOrder: number
  updatedAt: string
}): AssetLibraryFolder =>
  AssetLibraryFolderSchema.parse({
    id: input.id,
    accountId: input.accountId,
    name: input.name,
    slug: input.slug,
    sortOrder: input.sortOrder,
    ...(input.createdByUserId ? { createdByUserId: input.createdByUserId } : {}),
    ...(input.deletedAt ? { deletedAt: input.deletedAt } : {}),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  })

export const assetFolderWithCountDto = (folder: AssetLibraryFolder, assetCount: number): AssetFolderWithCount =>
  AssetFolderWithCountSchema.parse({
    ...folder,
    assetCount,
  })

export const assetTagDto = (input: {
  accountId: string
  color?: string
  createdAt: string
  deletedAt?: string
  description?: string
  id: string
  name: string
  slug: string
  sortOrder: number
  source: AssetTag['source']
  systemKey?: AssetTag['systemKey']
  updatedAt: string
  usageCount: number
}): AssetTag =>
  AssetTagSchema.parse({
    id: input.id,
    accountId: input.accountId,
    name: input.name,
    slug: input.slug,
    source: input.source,
    ...(input.systemKey ? { systemKey: input.systemKey } : {}),
    ...(input.color ? { color: input.color } : {}),
    ...(input.description ? { description: input.description } : {}),
    sortOrder: input.sortOrder,
    usageCount: input.usageCount,
    ...(input.deletedAt ? { deletedAt: input.deletedAt } : {}),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  })

export const assetItemDto = (input: {
  accountId: string
  addedByUserId?: string
  createdAt: string
  deletedAt?: string
  description?: string
  displayName: string
  favoritedAt?: string
  folderId?: string
  homeProjectId?: string
  id: string
  lastUsedAt?: string
  mediaObjectId: string
  sourceProjectId?: string
  sourceProjectName?: string
  sourceRef: Record<string, unknown>
  sourceType: AssetLibraryItem['sourceType']
  status: AssetLibraryItem['status']
  updatedAt: string
  usageCount: number
}): AssetLibraryItem =>
  AssetLibraryItemSchema.parse({
    id: input.id,
    accountId: input.accountId,
    mediaObjectId: input.mediaObjectId,
    ...(input.folderId ? { folderId: input.folderId } : {}),
    ...(input.homeProjectId ? { homeProjectId: input.homeProjectId } : {}),
    displayName: input.displayName,
    ...(input.description ? { description: input.description } : {}),
    status: input.status,
    sourceType: input.sourceType,
    ...(input.sourceProjectId ? { sourceProjectId: input.sourceProjectId } : {}),
    ...(input.sourceProjectName ? { sourceProjectName: input.sourceProjectName } : {}),
    sourceRef: input.sourceRef,
    ...(input.favoritedAt ? { favoritedAt: input.favoritedAt } : {}),
    ...(input.lastUsedAt ? { lastUsedAt: input.lastUsedAt } : {}),
    usageCount: input.usageCount,
    ...(input.addedByUserId ? { addedByUserId: input.addedByUserId } : {}),
    ...(input.deletedAt ? { deletedAt: input.deletedAt } : {}),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  })

export const assetItemWithRelationsDto = (
  item: AssetLibraryItem,
  input: {
    folder?: AssetLibraryFolder
    mediaObject: MediaObject
    tags: AssetTag[]
  },
): AssetLibraryItemWithRelations =>
  AssetLibraryItemWithRelationsSchema.parse({
    ...item,
    ...(input.folder ? { folder: input.folder } : {}),
    mediaObject: input.mediaObject,
    tags: input.tags,
  })

export const cloneAssetFolder = <T extends AssetLibraryFolder | AssetFolderWithCount>(folder: T): T => structuredClone(folder)
export const cloneAssetItem = <T extends AssetLibraryItem | AssetLibraryItemWithRelations>(item: T): T => structuredClone(item)
export const cloneAssetTag = (tag: AssetTag): AssetTag => structuredClone(tag)
