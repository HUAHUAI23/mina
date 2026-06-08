import { z } from 'zod'

import { MediaObjectSchema } from '../media/media-object.schemas'
import { ResourceKindSchema } from '../tasks/task.schemas'

export const AssetLibraryItemStatusSchema = z.enum(['active', 'archived', 'deleted', 'unavailable'])
export const AssetLibrarySourceTypeSchema = z.enum(['local_upload', 'workflow_output', 'external_import', 'system'])
export const UserCreateAssetLibrarySourceTypeSchema = z.enum(['workflow_output', 'external_import'])
export const AssetTagSourceSchema = z.enum(['system', 'custom'])
export const AssetSystemTagKeySchema = z.enum(['other', 'person', 'scene', 'object', 'style', 'sound_effect'])
export const AssetLibrarySortSchema = z.enum(['recent', 'used', 'name', 'relevance'])
export const AssetTagMatchSchema = z.enum(['all', 'any'])

const QueryBooleanSchema = z.preprocess((value) => {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return value
  const normalized = value.trim().toLowerCase()
  if (normalized === 'true' || normalized === '1') return true
  if (normalized === 'false' || normalized === '0') return false
  return value
}, z.boolean())

const QueryTagIdsSchema = z.preprocess((value) => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item !== 'string' || item.length > 4_000) return item
      return item.split(',').map((tagId) => tagId.trim()).filter(Boolean)
    })
  }
  if (typeof value === 'string') {
    if (value.length > 4_000) return value
    return value.split(',').map((tagId) => tagId.trim()).filter(Boolean)
  }
  return value
}, z.array(z.string().min(1).max(160)).max(20))

export const AssetLibraryFolderSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  sortOrder: z.number().int().min(0),
  createdByUserId: z.string().min(1).optional(),
  deletedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const AssetTagSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  source: AssetTagSourceSchema,
  systemKey: AssetSystemTagKeySchema.optional(),
  color: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  sortOrder: z.number().int().min(0),
  usageCount: z.number().int().nonnegative(),
  deletedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const AssetLibrarySourceRefSchema = z.record(z.string(), z.unknown()).default({})
const AssetLibrarySourceRefInputSchema = AssetLibrarySourceRefSchema.refine(
  (value) => JSON.stringify(value).length <= 16_384,
  'Source reference must be at most 16KB.',
)

export const AssetLibraryItemSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  mediaObjectId: z.string().min(1),
  folderId: z.string().min(1).optional(),
  homeProjectId: z.string().min(1).optional(),
  displayName: z.string().min(1),
  description: z.string().min(1).optional(),
  status: AssetLibraryItemStatusSchema,
  sourceType: AssetLibrarySourceTypeSchema,
  sourceProjectId: z.string().min(1).optional(),
  sourceProjectName: z.string().min(1).optional(),
  sourceRef: AssetLibrarySourceRefSchema,
  favoritedAt: z.string().datetime().optional(),
  lastUsedAt: z.string().datetime().optional(),
  usageCount: z.number().int().nonnegative(),
  addedByUserId: z.string().min(1).optional(),
  deletedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const AssetLibraryItemWithRelationsSchema = AssetLibraryItemSchema.extend({
  folder: AssetLibraryFolderSchema.optional(),
  mediaObject: MediaObjectSchema,
  tags: z.array(AssetTagSchema),
})

export const AssetFolderWithCountSchema = AssetLibraryFolderSchema.extend({
  assetCount: z.number().int().nonnegative(),
})

export const CreateAssetFolderSchema = z.object({
  name: z.string().trim().min(1).max(120),
})

export const UpdateAssetFolderSchema = z.object({
  name: z.string().trim().min(1).max(120),
})

export const CreateAssetTagSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().trim().min(1).max(40).optional(),
  description: z.string().trim().min(1).max(240).optional(),
})

export const UpdateAssetTagSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  color: z.string().trim().min(1).max(40).nullable().optional(),
  description: z.string().trim().min(1).max(240).nullable().optional(),
})

export const CreateAssetFromMediaObjectSchema = z.object({
  mediaObjectId: z.string().min(1),
  displayName: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().min(1).max(1_000).optional(),
  folderId: z.string().min(1).nullable().optional(),
  homeProjectId: z.string().min(1).nullable().optional(),
  tagIds: z.array(z.string().min(1)).max(20).default([]),
  sourceType: UserCreateAssetLibrarySourceTypeSchema.default('external_import'),
  sourceProjectId: z.string().min(1).nullable().optional(),
  sourceProjectName: z.string().trim().min(1).max(160).nullable().optional(),
  sourceRef: AssetLibrarySourceRefInputSchema.optional(),
})

export const CreateAssetFolderWithItemsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  assetItemIds: z.array(z.string().min(1)).min(1).max(50),
})

export const UploadAssetFormSchema = z.object({
  description: z.string().trim().max(1_000).optional(),
  displayName: z.string().trim().max(160).optional(),
  folderId: z.string().trim().min(1).nullable().optional(),
  homeProjectId: z.string().trim().min(1).nullable().optional(),
  kind: ResourceKindSchema.optional(),
  tagIds: z.array(z.string().trim().min(1)).max(20).default([]),
})

export const UpdateAssetLibraryItemSchema = z.object({
  displayName: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().min(1).max(1_000).nullable().optional(),
  folderId: z.string().min(1).nullable().optional(),
  homeProjectId: z.string().min(1).nullable().optional(),
  tagIds: z.array(z.string().min(1)).max(20).optional(),
  favorited: z.boolean().optional(),
  status: z.enum(['active', 'archived']).optional(),
})

export const AssetLibraryItemParamsSchema = z.object({
  id: z.string().min(1),
})

export const AssetLibraryFolderParamsSchema = z.object({
  folderId: z.string().min(1),
})

export const AssetTagParamsSchema = z.object({
  tagId: z.string().min(1),
})

export const ListAssetLibraryItemsQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  tagIds: QueryTagIdsSchema.optional(),
  tagMatch: AssetTagMatchSchema.default('all'),
  folderId: z.string().trim().optional(),
  sourceProjectId: z.string().trim().optional(),
  homeProjectId: z.string().trim().optional(),
  sourceType: AssetLibrarySourceTypeSchema.optional(),
  kind: ResourceKindSchema.optional(),
  favoriteOnly: QueryBooleanSchema.optional(),
  sort: AssetLibrarySortSchema.default('recent'),
  limit: z.coerce.number().int().min(1).max(100).default(60),
  cursor: z.string().trim().max(2_000).optional(),
})

export const ListAssetFoldersQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
})

export const ListAssetTagsQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
})

export const AssetLibraryListResponseSchema = z.object({
  folders: z.array(AssetFolderWithCountSchema),
  items: z.array(AssetLibraryItemWithRelationsSchema),
  nextCursor: z.string().min(1).optional(),
})

export const AssetLibraryItemResponseSchema = z.object({
  item: AssetLibraryItemWithRelationsSchema,
})

export const AssetFolderListResponseSchema = z.object({
  items: z.array(AssetFolderWithCountSchema),
})

export const AssetFolderResponseSchema = z.object({
  item: AssetFolderWithCountSchema,
})

export const AssetTagListResponseSchema = z.object({
  items: z.array(AssetTagSchema),
})

export const AssetTagResponseSchema = z.object({
  item: AssetTagSchema,
})

export const DeleteAssetResponseSchema = z.object({
  success: z.literal(true),
})

export const DeleteAssetFolderResponseSchema = DeleteAssetResponseSchema
export const DeleteAssetTagResponseSchema = DeleteAssetResponseSchema
export const UseAssetResponseSchema = AssetLibraryItemResponseSchema

export type AssetFolderWithCount = z.infer<typeof AssetFolderWithCountSchema>
export type AssetFolderListResponse = z.infer<typeof AssetFolderListResponseSchema>
export type AssetFolderResponse = z.infer<typeof AssetFolderResponseSchema>
export type AssetLibraryFolder = z.infer<typeof AssetLibraryFolderSchema>
export type AssetLibraryItem = z.infer<typeof AssetLibraryItemSchema>
export type AssetLibraryItemResponse = z.infer<typeof AssetLibraryItemResponseSchema>
export type AssetLibraryItemStatus = z.infer<typeof AssetLibraryItemStatusSchema>
export type AssetLibraryItemWithRelations = z.infer<typeof AssetLibraryItemWithRelationsSchema>
export type AssetLibraryListResponse = z.infer<typeof AssetLibraryListResponseSchema>
export type AssetLibrarySort = z.infer<typeof AssetLibrarySortSchema>
export type AssetLibrarySourceType = z.infer<typeof AssetLibrarySourceTypeSchema>
export type UserCreateAssetLibrarySourceType = z.infer<typeof UserCreateAssetLibrarySourceTypeSchema>
export type AssetTag = z.infer<typeof AssetTagSchema>
export type AssetTagListResponse = z.infer<typeof AssetTagListResponseSchema>
export type AssetTagMatch = z.infer<typeof AssetTagMatchSchema>
export type AssetTagResponse = z.infer<typeof AssetTagResponseSchema>
export type AssetTagSource = z.infer<typeof AssetTagSourceSchema>
export type AssetSystemTagKey = z.infer<typeof AssetSystemTagKeySchema>
export type CreateAssetFolderInput = z.infer<typeof CreateAssetFolderSchema>
export type CreateAssetFolderWithItemsInput = z.infer<typeof CreateAssetFolderWithItemsSchema>
export type CreateAssetFromMediaObjectInput = z.infer<typeof CreateAssetFromMediaObjectSchema>
export type CreateAssetTagInput = z.infer<typeof CreateAssetTagSchema>
export type DeleteAssetResponse = z.infer<typeof DeleteAssetResponseSchema>
export type ListAssetLibraryItemsQuery = z.infer<typeof ListAssetLibraryItemsQuerySchema>
export type ListAssetFoldersQuery = z.infer<typeof ListAssetFoldersQuerySchema>
export type ListAssetTagsQuery = z.infer<typeof ListAssetTagsQuerySchema>
export type UpdateAssetFolderInput = z.infer<typeof UpdateAssetFolderSchema>
export type UpdateAssetLibraryItemInput = z.infer<typeof UpdateAssetLibraryItemSchema>
export type UpdateAssetTagInput = z.infer<typeof UpdateAssetTagSchema>
export type UploadAssetFormInput = z.infer<typeof UploadAssetFormSchema>
