import type {
  AssetFolderWithCount,
  AssetLibraryFolder,
  AssetLibraryItemWithRelations,
  AssetLibrarySourceType,
  AssetTag,
  AssetTagMatch,
} from '@mina/contracts/modules/assets'
import type { ResourceKind } from '@mina/contracts/modules/tasks'

export interface CreateAssetFolderRecordInput {
  accountId: string
  createdByUserId?: string
  id: string
  name: string
  slug: string
  sortOrder: number
  timestamp: string
}

export interface CreateAssetTagRecordInput {
  accountId: string
  color?: string
  description?: string
  id: string
  name: string
  slug: string
  sortOrder: number
  source: AssetTag['source']
  systemKey?: AssetTag['systemKey']
  timestamp: string
}

export interface CreateAssetItemRecordInput {
  accountId: string
  addedByUserId?: string
  description?: string
  displayName: string
  folderId?: string
  homeProjectId?: string
  id: string
  mediaObjectId: string
  sourceProjectId?: string
  sourceProjectName?: string
  sourceRef: Record<string, unknown>
  sourceType: AssetLibrarySourceType
  tagIds: string[]
  timestamp: string
}

export interface ListAssetItemsInput {
  accountId: string
  cursor?: string
  favoriteOnly?: boolean
  folderId?: string
  homeProjectId?: string
  kind?: ResourceKind
  limit: number
  q?: string
  sort: 'recent' | 'used' | 'name' | 'relevance'
  sourceProjectId?: string
  sourceType?: AssetLibrarySourceType
  tagIds: string[]
  tagMatch: AssetTagMatch
}

export interface ListAssetItemsResult {
  items: AssetLibraryItemWithRelations[]
  nextCursor?: string
}

export interface AssetLibraryRepository {
  addTagToItem(input: { accountId: string; itemId: string; tagId: string; timestamp: string }): Promise<AssetLibraryItemWithRelations | undefined>
  createFolder(input: CreateAssetFolderRecordInput): Promise<AssetFolderWithCount>
  createFolderWithItems(input: CreateAssetFolderRecordInput & { assetItemIds: string[] }): Promise<AssetFolderWithCount | undefined>
  createItem(input: CreateAssetItemRecordInput): Promise<AssetLibraryItemWithRelations>
  createTag(input: CreateAssetTagRecordInput): Promise<AssetTag>
  deleteFolder(input: { accountId: string; folderId: string; timestamp: string }): Promise<boolean>
  deleteItem(input: { accountId: string; itemId: string; timestamp: string }): Promise<boolean>
  deleteTag(input: { accountId: string; tagId: string; timestamp: string }): Promise<boolean>
  ensureSystemTags(accountId: string, timestamp: string): Promise<AssetTag[]>
  findFolderById(accountId: string, folderId: string): Promise<AssetFolderWithCount | undefined>
  findFolderBySlug(accountId: string, slug: string): Promise<AssetLibraryFolder | undefined>
  findItemById(accountId: string, itemId: string): Promise<AssetLibraryItemWithRelations | undefined>
  findTagById(accountId: string, tagId: string): Promise<AssetTag | undefined>
  findTagBySlug(accountId: string, slug: string): Promise<AssetTag | undefined>
  hasSystemTags(accountId: string): Promise<boolean>
  listFolders(accountId: string, q?: string): Promise<AssetFolderWithCount[]>
  listItems(input: ListAssetItemsInput): Promise<ListAssetItemsResult>
  listTags(accountId: string, q?: string): Promise<AssetTag[]>
  removeTagFromItem(input: { accountId: string; itemId: string; tagId: string; timestamp: string }): Promise<AssetLibraryItemWithRelations | undefined>
  updateFolder(input: { accountId: string; folderId: string; name: string; slug: string; timestamp: string }): Promise<AssetFolderWithCount | undefined>
  updateItem(input: {
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
  }): Promise<AssetLibraryItemWithRelations | undefined>
  updateTag(input: {
    accountId: string
    color?: string | null
    description?: string | null
    name?: string
    slug?: string
    tagId: string
    timestamp: string
  }): Promise<AssetTag | undefined>
  useItem(input: { accountId: string; itemId: string; timestamp: string }): Promise<AssetLibraryItemWithRelations | undefined>
}
