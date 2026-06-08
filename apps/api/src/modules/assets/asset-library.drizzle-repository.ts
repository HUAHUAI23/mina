import { MediaObjectSchema, type MediaObject } from '@mina/contracts/modules/media/media-object'
import type {
  AssetFolderWithCount,
  AssetLibraryFolder,
  AssetLibraryItem,
  AssetLibraryItemWithRelations,
  AssetTag,
} from '@mina/contracts/modules/assets'
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm'

import type { MinaDbClient, MinaDbTransaction } from '../../db/client'
import {
  assetLibraryFolders,
  assetLibraryItems,
  assetLibraryItemTags,
  assetTags,
  mediaObjects,
} from '../../db/schema'
import {
  assetFolderDto,
  assetFolderWithCountDto,
  assetItemDto,
  assetItemWithRelationsDto,
  assetTagDto,
  toIso,
} from './asset-library-mappers'
import { defaultAssetSystemTags } from './asset-library-defaults'
import type {
  AssetLibraryRepository,
  CreateAssetFolderRecordInput,
  CreateAssetItemRecordInput,
  CreateAssetTagRecordInput,
  ListAssetItemsInput,
  ListAssetItemsResult,
} from './asset-library.repository'

type AssetFolderRow = typeof assetLibraryFolders.$inferSelect
type AssetItemRow = typeof assetLibraryItems.$inferSelect
type AssetTagRow = typeof assetTags.$inferSelect
type MediaObjectRow = typeof mediaObjects.$inferSelect
type QueryDb = MinaDbClient | MinaDbTransaction

const toDate = (value: string | undefined): Date | null => (value ? new Date(value) : null)

const mediaObjectFromRow = (row: MediaObjectRow): MediaObject =>
  MediaObjectSchema.parse({
    id: row.id,
    accountId: row.accountId,
    kind: row.kind,
    status: row.status,
    bucket: row.bucket,
    storageKey: row.storageKey,
    url: row.url,
    ...(row.mimeType ? { mimeType: row.mimeType } : {}),
    byteSize: row.byteSize,
    ...(row.checksum ? { checksum: row.checksum } : {}),
    ...(row.width !== null ? { width: row.width } : {}),
    ...(row.height !== null ? { height: row.height } : {}),
    ...(row.durationSeconds !== null ? { durationSeconds: Number(row.durationSeconds) } : {}),
    origin: row.origin,
    purpose: row.purpose,
    retention: row.retention,
    ...(row.parentMediaObjectId ? { parentMediaObjectId: row.parentMediaObjectId } : {}),
    ...(row.sourceTaskId ? { sourceTaskId: row.sourceTaskId } : {}),
    ...(row.sourceTaskResourceId ? { sourceTaskResourceId: row.sourceTaskResourceId } : {}),
    ...(row.metadata ? { metadata: row.metadata } : {}),
    ...(row.expiresAt ? { expiresAt: toIso(row.expiresAt) } : {}),
    ...(row.deletedAt ? { deletedAt: toIso(row.deletedAt) } : {}),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  })

const folderFromRow = (row: AssetFolderRow): AssetLibraryFolder =>
  assetFolderDto({
    accountId: row.accountId,
    createdAt: toIso(row.createdAt),
    ...(row.createdByUserId ? { createdByUserId: row.createdByUserId } : {}),
    ...(row.deletedAt ? { deletedAt: toIso(row.deletedAt) } : {}),
    id: row.id,
    name: row.name,
    slug: row.slug,
    sortOrder: row.sortOrder,
    updatedAt: toIso(row.updatedAt),
  })

const tagFromRow = (row: AssetTagRow, usageCount = row.usageCount): AssetTag =>
  assetTagDto({
    accountId: row.accountId,
    ...(row.color ? { color: row.color } : {}),
    createdAt: toIso(row.createdAt),
    ...(row.deletedAt ? { deletedAt: toIso(row.deletedAt) } : {}),
    ...(row.description ? { description: row.description } : {}),
    id: row.id,
    name: row.name,
    slug: row.slug,
    sortOrder: row.sortOrder,
    source: row.source,
    ...(row.systemKey ? { systemKey: row.systemKey } : {}),
    updatedAt: toIso(row.updatedAt),
    usageCount,
  })

const itemFromRow = (row: AssetItemRow): AssetLibraryItem =>
  assetItemDto({
    accountId: row.accountId,
    ...(row.addedByUserId ? { addedByUserId: row.addedByUserId } : {}),
    createdAt: toIso(row.createdAt),
    ...(row.deletedAt ? { deletedAt: toIso(row.deletedAt) } : {}),
    ...(row.description ? { description: row.description } : {}),
    displayName: row.displayName,
    ...(row.favoritedAt ? { favoritedAt: toIso(row.favoritedAt) } : {}),
    ...(row.folderId ? { folderId: row.folderId } : {}),
    ...(row.homeProjectId ? { homeProjectId: row.homeProjectId } : {}),
    id: row.id,
    ...(row.lastUsedAt ? { lastUsedAt: toIso(row.lastUsedAt) } : {}),
    mediaObjectId: row.mediaObjectId,
    ...(row.sourceProjectId ? { sourceProjectId: row.sourceProjectId } : {}),
    ...(row.sourceProjectName ? { sourceProjectName: row.sourceProjectName } : {}),
    sourceRef: row.sourceRef ?? {},
    sourceType: row.sourceType,
    status: row.status,
    updatedAt: toIso(row.updatedAt),
    usageCount: row.usageCount,
  })

const itemQueryScoreSql = (pattern: string) => sql<number>`
  (
    case when ${assetLibraryItems.displayName} ilike ${pattern} escape '\\' then 100 else 0 end +
    case when exists (
      select 1
      from ${assetLibraryItemTags}
      inner join ${assetTags} on ${assetTags.id} = ${assetLibraryItemTags.tagId}
      where ${assetLibraryItemTags.assetItemId} = ${assetLibraryItems.id}
        and ${assetTags.accountId} = ${assetLibraryItems.accountId}
        and ${assetTags.deletedAt} is null
        and (${assetTags.name} ilike ${pattern} escape '\\' or ${assetTags.slug} ilike ${pattern} escape '\\')
    ) then 70 else 0 end +
    case when ${assetLibraryItems.sourceProjectName} ilike ${pattern} escape '\\' or ${assetLibraryItems.sourceProjectId} ilike ${pattern} escape '\\' then 45 else 0 end +
    case when ${assetLibraryItems.description} ilike ${pattern} escape '\\' then 35 else 0 end +
    case when ${assetLibraryItems.sourceRef}::text ilike ${pattern} escape '\\' then 15 else 0 end +
    case when ${mediaObjects.metadata}::text ilike ${pattern} escape '\\' then 15 else 0 end +
    case when ${assetLibraryItems.favoritedAt} is not null then 3 else 0 end +
    least(${assetLibraryItems.usageCount}, 10)
  )
`

type AssetItemCursor = {
  displayName?: string
  id: string
  score?: number
  sort: ListAssetItemsInput['sort']
  updatedAt: string
  usageCount?: number
  usedAt?: string
}

const encodeCursor = (cursor: AssetItemCursor): string =>
  Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')

const decodeCursor = (cursor: string | undefined): AssetItemCursor | undefined => {
  if (!cursor) {
    return undefined
  }
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown
    if (
      parsed &&
      typeof parsed === 'object' &&
      'id' in parsed &&
      typeof parsed.id === 'string' &&
      'sort' in parsed &&
      typeof parsed.sort === 'string' &&
      'updatedAt' in parsed &&
      typeof parsed.updatedAt === 'string'
    ) {
      return parsed as AssetItemCursor
    }
  } catch {
    return undefined
  }
  return undefined
}

const escapeLike = (value: string): string => value.replace(/[\\%_]/g, (match) => `\\${match}`)

const jsonSearch = (column: SQL | typeof assetLibraryItems.sourceRef | typeof mediaObjects.metadata, query: string) =>
  sql`${column}::text ilike ${query} escape '\\'`

const textSearchCondition = (pattern: string) => sql`
  (
    ${assetLibraryItems.displayName} ilike ${pattern} escape '\\'
    or ${assetLibraryItems.description} ilike ${pattern} escape '\\'
    or ${assetLibraryItems.sourceProjectId} ilike ${pattern} escape '\\'
    or ${assetLibraryItems.sourceProjectName} ilike ${pattern} escape '\\'
    or ${mediaObjects.kind} ilike ${pattern} escape '\\'
    or ${mediaObjects.mimeType} ilike ${pattern} escape '\\'
    or ${jsonSearch(assetLibraryItems.sourceRef, pattern)}
    or ${jsonSearch(mediaObjects.metadata, pattern)}
    or exists (
      select 1
      from ${assetLibraryItemTags}
      inner join ${assetTags} on ${assetTags.id} = ${assetLibraryItemTags.tagId}
      where ${assetLibraryItemTags.assetItemId} = ${assetLibraryItems.id}
        and ${assetTags.accountId} = ${assetLibraryItems.accountId}
        and ${assetTags.deletedAt} is null
        and (${assetTags.name} ilike ${pattern} escape '\\' or ${assetTags.slug} ilike ${pattern} escape '\\')
    )
  )
`

const tagMatchCondition = (tagIds: string[], tagMatch: ListAssetItemsInput['tagMatch']) =>
  tagMatch === 'any'
    ? sql`exists (
        select 1
        from ${assetLibraryItemTags}
        inner join ${assetTags} on ${assetTags.id} = ${assetLibraryItemTags.tagId}
        where ${assetLibraryItemTags.assetItemId} = ${assetLibraryItems.id}
          and ${inArray(assetLibraryItemTags.tagId, tagIds)}
          and ${assetTags.accountId} = ${assetLibraryItems.accountId}
          and ${assetTags.deletedAt} is null
      )`
    : sql`(
        select count(distinct ${assetLibraryItemTags.tagId})
        from ${assetLibraryItemTags}
        inner join ${assetTags} on ${assetTags.id} = ${assetLibraryItemTags.tagId}
        where ${assetLibraryItemTags.assetItemId} = ${assetLibraryItems.id}
          and ${inArray(assetLibraryItemTags.tagId, tagIds)}
          and ${assetTags.accountId} = ${assetLibraryItems.accountId}
          and ${assetTags.deletedAt} is null
      ) = ${tagIds.length}`

const recentCursorCondition = (cursor: AssetItemCursor) => sql`
  (
    ${assetLibraryItems.updatedAt} < ${new Date(cursor.updatedAt)}
    or (${assetLibraryItems.updatedAt} = ${new Date(cursor.updatedAt)} and ${assetLibraryItems.id} < ${cursor.id})
  )
`

const nameCursorCondition = (cursor: AssetItemCursor) => sql`
  (
    lower(${assetLibraryItems.displayName}) > ${cursor.displayName ?? ''}
    or (lower(${assetLibraryItems.displayName}) = ${cursor.displayName ?? ''} and ${assetLibraryItems.id} > ${cursor.id})
  )
`

const usedAtSql = sql<Date>`coalesce(${assetLibraryItems.lastUsedAt}, ${assetLibraryItems.updatedAt})`

const usedCursorCondition = (cursor: AssetItemCursor) => sql`
  (
    ${usedAtSql} < ${new Date(cursor.usedAt ?? cursor.updatedAt)}
    or (
      ${usedAtSql} = ${new Date(cursor.usedAt ?? cursor.updatedAt)}
      and ${assetLibraryItems.usageCount} < ${cursor.usageCount ?? 0}
    )
    or (
      ${usedAtSql} = ${new Date(cursor.usedAt ?? cursor.updatedAt)}
      and ${assetLibraryItems.usageCount} = ${cursor.usageCount ?? 0}
      and ${assetLibraryItems.id} < ${cursor.id}
    )
  )
`

const relevanceCursorCondition = (cursor: AssetItemCursor, scoreSql: SQL<number>) => sql`
  (
    ${scoreSql} < ${cursor.score ?? 0}
    or (${scoreSql} = ${cursor.score ?? 0} and ${assetLibraryItems.updatedAt} < ${new Date(cursor.updatedAt)})
    or (
      ${scoreSql} = ${cursor.score ?? 0}
      and ${assetLibraryItems.updatedAt} = ${new Date(cursor.updatedAt)}
      and ${assetLibraryItems.id} < ${cursor.id}
    )
  )
`

export class DrizzleAssetLibraryRepository implements AssetLibraryRepository {
  constructor(private readonly db: MinaDbClient) {}

  async addTagToItem(input: { accountId: string; itemId: string; tagId: string; timestamp: string }) {
    const item = await this.findItemRow(this.db, input.accountId, input.itemId)
    const tag = await this.findTagRow(this.db, input.accountId, input.tagId)
    if (!item || !tag) {
      return undefined
    }
    await this.db
      .insert(assetLibraryItemTags)
      .values({ assetItemId: input.itemId, createdAt: new Date(input.timestamp), tagId: input.tagId })
      .onConflictDoNothing()
    await this.refreshTagUsage(input.accountId, input.tagId)
    await this.touchItem(input.accountId, input.itemId, input.timestamp)
    return this.findItemById(input.accountId, input.itemId)
  }

  async createFolder(input: CreateAssetFolderRecordInput): Promise<AssetFolderWithCount> {
    const [row] = await this.db
      .insert(assetLibraryFolders)
      .values({
        accountId: input.accountId,
        createdAt: new Date(input.timestamp),
        createdByUserId: input.createdByUserId ?? null,
        deletedAt: null,
        id: input.id,
        name: input.name,
        slug: input.slug,
        sortOrder: input.sortOrder,
        updatedAt: new Date(input.timestamp),
      })
      .returning()
    if (!row) {
      throw new Error('Asset folder was not persisted.')
    }
    return assetFolderWithCountDto(folderFromRow(row), 0)
  }

  async createFolderWithItems(input: CreateAssetFolderRecordInput & { assetItemIds: string[] }): Promise<AssetFolderWithCount | undefined> {
    const itemIds = [...new Set(input.assetItemIds)].filter(Boolean)
    if (itemIds.length === 0) {
      return undefined
    }
    return this.db.transaction(async (tx) => {
      const existingItems = await tx
        .select({ id: assetLibraryItems.id })
        .from(assetLibraryItems)
        .where(
          and(
            eq(assetLibraryItems.accountId, input.accountId),
            inArray(assetLibraryItems.id, itemIds),
            isNull(assetLibraryItems.deletedAt),
            eq(assetLibraryItems.status, 'active'),
          ),
        )
      if (new Set(existingItems.map((item) => item.id)).size !== itemIds.length) {
        return undefined
      }
      const [folder] = await tx
        .insert(assetLibraryFolders)
        .values({
          accountId: input.accountId,
          createdAt: new Date(input.timestamp),
          createdByUserId: input.createdByUserId ?? null,
          deletedAt: null,
          id: input.id,
          name: input.name,
          slug: input.slug,
          sortOrder: input.sortOrder,
          updatedAt: new Date(input.timestamp),
        })
        .returning()
      if (!folder) {
        throw new Error('Asset folder was not persisted.')
      }
      await tx
        .update(assetLibraryItems)
        .set({ folderId: folder.id, updatedAt: new Date(input.timestamp) })
        .where(
          and(
            eq(assetLibraryItems.accountId, input.accountId),
            inArray(assetLibraryItems.id, itemIds),
            isNull(assetLibraryItems.deletedAt),
          ),
        )
      return assetFolderWithCountDto(folderFromRow(folder), itemIds.length)
    })
  }

  async createItem(input: CreateAssetItemRecordInput): Promise<AssetLibraryItemWithRelations> {
    await this.db.transaction(async (tx) => {
      await tx.insert(assetLibraryItems).values({
        accountId: input.accountId,
        addedByUserId: input.addedByUserId ?? null,
        createdAt: new Date(input.timestamp),
        deletedAt: null,
        description: input.description ?? null,
        displayName: input.displayName,
        favoritedAt: null,
        folderId: input.folderId ?? null,
        homeProjectId: input.homeProjectId ?? null,
        id: input.id,
        lastUsedAt: null,
        mediaObjectId: input.mediaObjectId,
        sourceProjectId: input.sourceProjectId ?? null,
        sourceProjectName: input.sourceProjectName ?? null,
        sourceRef: input.sourceRef,
        sourceType: input.sourceType,
        status: 'active',
        updatedAt: new Date(input.timestamp),
        usageCount: 0,
      })
      if (input.tagIds.length > 0) {
        await tx.insert(assetLibraryItemTags).values(
          input.tagIds.map((tagId) => ({
            assetItemId: input.id,
            createdAt: new Date(input.timestamp),
            tagId,
          })),
        )
      }
    })
    await this.refreshTagUsageForIds(input.accountId, input.tagIds)
    const item = await this.findItemById(input.accountId, input.id)
    if (!item) {
      throw new Error('Asset item was not loaded after creation.')
    }
    return item
  }

  async createTag(input: CreateAssetTagRecordInput): Promise<AssetTag> {
    const [row] = await this.db
      .insert(assetTags)
      .values({
        accountId: input.accountId,
        color: input.color ?? null,
        createdAt: new Date(input.timestamp),
        deletedAt: null,
        description: input.description ?? null,
        id: input.id,
        name: input.name,
        slug: input.slug,
        sortOrder: input.sortOrder,
        source: input.source,
        systemKey: input.systemKey ?? null,
        updatedAt: new Date(input.timestamp),
        usageCount: 0,
      })
      .returning()
    if (!row) {
      throw new Error('Asset tag was not persisted.')
    }
    return tagFromRow(row)
  }

  async deleteFolder(input: { accountId: string; folderId: string; timestamp: string }): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(assetLibraryFolders)
        .set({ deletedAt: new Date(input.timestamp), updatedAt: new Date(input.timestamp) })
        .where(
          and(
            eq(assetLibraryFolders.accountId, input.accountId),
            eq(assetLibraryFolders.id, input.folderId),
            isNull(assetLibraryFolders.deletedAt),
          ),
        )
        .returning({ id: assetLibraryFolders.id })
      if (!row) {
        return false
      }
      await tx
        .update(assetLibraryItems)
        .set({ folderId: null, updatedAt: new Date(input.timestamp) })
        .where(
          and(
            eq(assetLibraryItems.accountId, input.accountId),
            eq(assetLibraryItems.folderId, input.folderId),
            isNull(assetLibraryItems.deletedAt),
          ),
        )
      return true
    })
  }

  async deleteItem(input: { accountId: string; itemId: string; timestamp: string }): Promise<boolean> {
    const [row] = await this.db
      .update(assetLibraryItems)
      .set({
        deletedAt: new Date(input.timestamp),
        status: 'deleted',
        updatedAt: new Date(input.timestamp),
      })
      .where(
        and(
          eq(assetLibraryItems.accountId, input.accountId),
          eq(assetLibraryItems.id, input.itemId),
          isNull(assetLibraryItems.deletedAt),
        ),
      )
      .returning({ id: assetLibraryItems.id })
    if (!row) {
      return false
    }
    await this.refreshAllTagUsage(input.accountId)
    return true
  }

  async deleteTag(input: { accountId: string; tagId: string; timestamp: string }): Promise<boolean> {
    const [row] = await this.db
      .update(assetTags)
      .set({ deletedAt: new Date(input.timestamp), updatedAt: new Date(input.timestamp), usageCount: 0 })
      .where(and(eq(assetTags.accountId, input.accountId), eq(assetTags.id, input.tagId), isNull(assetTags.deletedAt)))
      .returning({ id: assetTags.id })
    return row !== undefined
  }

  async ensureSystemTags(accountId: string, timestamp: string): Promise<AssetTag[]> {
    for (const tag of defaultAssetSystemTags) {
      const [existing] = await this.db
        .select()
        .from(assetTags)
        .where(and(eq(assetTags.accountId, accountId), eq(assetTags.slug, tag.slug)))
        .limit(1)
      if (existing) {
        await this.db
          .update(assetTags)
          .set({
            color: tag.color,
            deletedAt: null,
            name: tag.name,
            sortOrder: tag.sortOrder,
            source: 'system',
            systemKey: tag.key,
            updatedAt: new Date(timestamp),
          })
          .where(eq(assetTags.id, existing.id))
      } else {
        await this.db
          .insert(assetTags)
          .values({
            accountId,
            color: tag.color,
            createdAt: new Date(timestamp),
            deletedAt: null,
            description: null,
            id: `asset_tag_${tag.key}_${crypto.randomUUID()}`,
            name: tag.name,
            slug: tag.slug,
            sortOrder: tag.sortOrder,
            source: 'system',
            systemKey: tag.key,
            updatedAt: new Date(timestamp),
            usageCount: 0,
          })
          .onConflictDoUpdate({
            set: {
              color: tag.color,
              deletedAt: null,
              name: tag.name,
              sortOrder: tag.sortOrder,
              source: 'system',
              systemKey: tag.key,
              updatedAt: new Date(timestamp),
            },
            target: [assetTags.accountId, assetTags.slug],
            targetWhere: sql`${assetTags.deletedAt} is null`,
          })
      }
    }
    return this.listTags(accountId)
  }

  async findFolderById(accountId: string, folderId: string): Promise<AssetFolderWithCount | undefined> {
    const row = await this.findFolderRow(this.db, accountId, folderId)
    if (!row) {
      return undefined
    }
    return assetFolderWithCountDto(folderFromRow(row), await this.folderAssetCount(accountId, folderId))
  }

  async findFolderBySlug(accountId: string, slug: string): Promise<AssetLibraryFolder | undefined> {
    const [row] = await this.db
      .select()
      .from(assetLibraryFolders)
      .where(
        and(
          eq(assetLibraryFolders.accountId, accountId),
          eq(assetLibraryFolders.slug, slug),
          isNull(assetLibraryFolders.deletedAt),
        ),
      )
      .limit(1)
    return row ? folderFromRow(row) : undefined
  }

  async findItemById(accountId: string, itemId: string): Promise<AssetLibraryItemWithRelations | undefined> {
    const rows = await this.loadItems(accountId, [itemId], { activeOnly: true })
    return rows.at(0)
  }

  async findTagById(accountId: string, tagId: string): Promise<AssetTag | undefined> {
    const row = await this.findTagRow(this.db, accountId, tagId)
    return row ? tagFromRow(row, await this.tagUsageCount(accountId, tagId)) : undefined
  }

  async findTagBySlug(accountId: string, slug: string): Promise<AssetTag | undefined> {
    const [row] = await this.db
      .select()
      .from(assetTags)
      .where(and(eq(assetTags.accountId, accountId), eq(assetTags.slug, slug), isNull(assetTags.deletedAt)))
      .limit(1)
    return row ? tagFromRow(row, await this.tagUsageCount(accountId, row.id)) : undefined
  }

  async hasSystemTags(accountId: string): Promise<boolean> {
    const expectedKeys = defaultAssetSystemTags.map((tag) => tag.key)
    const rows = await this.db
      .select({ systemKey: assetTags.systemKey })
      .from(assetTags)
      .where(
        and(
          eq(assetTags.accountId, accountId),
          eq(assetTags.source, 'system'),
          inArray(assetTags.systemKey, expectedKeys),
          isNull(assetTags.deletedAt),
        ),
      )
    return new Set(rows.map((row) => row.systemKey).filter(Boolean)).size === expectedKeys.length
  }

  async listFolders(accountId: string, q?: string): Promise<AssetFolderWithCount[]> {
    const rows = await this.db
      .select()
      .from(assetLibraryFolders)
      .where(and(eq(assetLibraryFolders.accountId, accountId), isNull(assetLibraryFolders.deletedAt)))
      .orderBy(asc(assetLibraryFolders.sortOrder), asc(assetLibraryFolders.name))
    const normalized = q?.trim().toLowerCase()
    const counts = await this.folderCounts(accountId)
    return rows
      .map(folderFromRow)
      .filter((folder) => !normalized || folder.name.toLowerCase().includes(normalized) || folder.slug.includes(normalized))
      .map((folder) => assetFolderWithCountDto(folder, counts.get(folder.id) ?? 0))
  }

  async listItems(input: ListAssetItemsInput): Promise<ListAssetItemsResult> {
    const queryText = input.q?.trim()
    const pattern = queryText ? `%${escapeLike(queryText)}%` : undefined
    const effectiveSort: ListAssetItemsInput['sort'] = queryText ? 'relevance' : input.sort
    const scoreSql = pattern ? itemQueryScoreSql(pattern) : sql<number>`0`
    const conditions: SQL[] = [
      eq(assetLibraryItems.accountId, input.accountId),
      eq(mediaObjects.accountId, input.accountId),
      isNull(assetLibraryItems.deletedAt),
      eq(assetLibraryItems.status, 'active'),
      eq(mediaObjects.status, 'ready'),
      isNull(mediaObjects.deletedAt),
    ]
    if (input.folderId) conditions.push(eq(assetLibraryItems.folderId, input.folderId))
    if (input.homeProjectId) conditions.push(eq(assetLibraryItems.homeProjectId, input.homeProjectId))
    if (input.sourceProjectId) conditions.push(eq(assetLibraryItems.sourceProjectId, input.sourceProjectId))
    if (input.sourceType) conditions.push(eq(assetLibraryItems.sourceType, input.sourceType))
    if (input.kind) conditions.push(eq(mediaObjects.kind, input.kind))
    if (input.favoriteOnly) conditions.push(sql`${assetLibraryItems.favoritedAt} is not null`)
    if (input.tagIds.length > 0) {
      conditions.push(tagMatchCondition(input.tagIds, input.tagMatch))
    }
    if (pattern) {
      conditions.push(textSearchCondition(pattern))
    }
    const cursor = decodeCursor(input.cursor)
    if (cursor?.sort === effectiveSort) {
      if (effectiveSort === 'name') {
        conditions.push(nameCursorCondition(cursor))
      } else if (effectiveSort === 'used') {
        conditions.push(usedCursorCondition(cursor))
      } else if (effectiveSort === 'relevance') {
        conditions.push(relevanceCursorCondition(cursor, scoreSql))
      } else {
        conditions.push(recentCursorCondition(cursor))
      }
    }

    const orderBy =
      effectiveSort === 'name'
        ? [asc(sql`lower(${assetLibraryItems.displayName})`), asc(assetLibraryItems.id)]
        : effectiveSort === 'used'
          ? [desc(usedAtSql), desc(assetLibraryItems.usageCount), desc(assetLibraryItems.id)]
          : effectiveSort === 'relevance'
            ? [desc(scoreSql), desc(assetLibraryItems.updatedAt), desc(assetLibraryItems.id)]
            : [desc(assetLibraryItems.updatedAt), desc(assetLibraryItems.id)]

    const rows = await this.db
      .select({ item: assetLibraryItems, mediaObject: mediaObjects, score: scoreSql })
      .from(assetLibraryItems)
      .innerJoin(mediaObjects, eq(mediaObjects.id, assetLibraryItems.mediaObjectId))
      .where(and(...conditions))
      .orderBy(...orderBy)
      .limit(input.limit + 1)

    const visibleRows = rows.slice(0, input.limit)
    const items = await this.itemsWithRelations(input.accountId, visibleRows.map((row) => ({ item: row.item, mediaObject: row.mediaObject })))
    const lastRow = visibleRows.at(-1)
    const nextCursor = rows.length > input.limit && lastRow
      ? encodeCursor({
          ...(effectiveSort === 'name' ? { displayName: lastRow.item.displayName.toLowerCase() } : {}),
          id: lastRow.item.id,
          ...(effectiveSort === 'relevance' ? { score: Number(lastRow.score) } : {}),
          sort: effectiveSort,
          updatedAt: toIso(lastRow.item.updatedAt),
          ...(effectiveSort === 'used'
            ? {
                usageCount: lastRow.item.usageCount,
                usedAt: toIso(lastRow.item.lastUsedAt ?? lastRow.item.updatedAt),
              }
            : {}),
        })
      : undefined
    return {
      items,
      ...(nextCursor ? { nextCursor } : {}),
    }
  }

  async listTags(accountId: string, q?: string): Promise<AssetTag[]> {
    const rows = await this.db
      .select()
      .from(assetTags)
      .where(and(eq(assetTags.accountId, accountId), isNull(assetTags.deletedAt)))
      .orderBy(asc(assetTags.sortOrder), asc(assetTags.name))
    const normalized = q?.trim().toLowerCase()
    const counts = await this.tagCounts(accountId)
    return rows
      .map((row) => tagFromRow(row, counts.get(row.id) ?? 0))
      .filter((tag) => !normalized || tag.name.toLowerCase().includes(normalized) || tag.slug.includes(normalized))
  }

  async removeTagFromItem(input: { accountId: string; itemId: string; tagId: string; timestamp: string }) {
    const item = await this.findItemRow(this.db, input.accountId, input.itemId)
    const tag = await this.findTagRow(this.db, input.accountId, input.tagId)
    if (!item || !tag) {
      return undefined
    }
    await this.db
      .delete(assetLibraryItemTags)
      .where(and(eq(assetLibraryItemTags.assetItemId, input.itemId), eq(assetLibraryItemTags.tagId, input.tagId)))
    await this.refreshTagUsage(input.accountId, input.tagId)
    await this.touchItem(input.accountId, input.itemId, input.timestamp)
    const rows = await this.loadItems(input.accountId, [input.itemId])
    return rows.at(0)
  }

  async updateFolder(input: { accountId: string; folderId: string; name: string; slug: string; timestamp: string }) {
    const [row] = await this.db
      .update(assetLibraryFolders)
      .set({ name: input.name, slug: input.slug, updatedAt: new Date(input.timestamp) })
      .where(
        and(
          eq(assetLibraryFolders.accountId, input.accountId),
          eq(assetLibraryFolders.id, input.folderId),
          isNull(assetLibraryFolders.deletedAt),
        ),
      )
      .returning()
    return row ? assetFolderWithCountDto(folderFromRow(row), await this.folderAssetCount(input.accountId, input.folderId)) : undefined
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
  }) {
    const item = await this.findItemRow(this.db, input.accountId, input.itemId)
    if (!item) {
      return undefined
    }
    await this.db.transaction(async (tx) => {
      await tx
        .update(assetLibraryItems)
        .set({
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
          ...(input.favoritedAt !== undefined ? { favoritedAt: toDate(input.favoritedAt ?? undefined) } : {}),
          ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
          ...(input.homeProjectId !== undefined ? { homeProjectId: input.homeProjectId } : {}),
          ...(input.status ? { status: input.status } : {}),
          updatedAt: new Date(input.timestamp),
        })
        .where(and(eq(assetLibraryItems.accountId, input.accountId), eq(assetLibraryItems.id, input.itemId)))
      if (input.tagIds) {
        await tx.delete(assetLibraryItemTags).where(eq(assetLibraryItemTags.assetItemId, input.itemId))
        if (input.tagIds.length > 0) {
          await tx.insert(assetLibraryItemTags).values(
            input.tagIds.map((tagId) => ({
              assetItemId: input.itemId,
              createdAt: new Date(input.timestamp),
              tagId,
            })),
          )
        }
      }
    })
    if (input.tagIds) {
      await this.refreshAllTagUsage(input.accountId)
    }
    const rows = await this.loadItems(input.accountId, [input.itemId])
    return rows.at(0)
  }

  async updateTag(input: {
    accountId: string
    color?: string | null
    description?: string | null
    name?: string
    slug?: string
    tagId: string
    timestamp: string
  }) {
    const [row] = await this.db
      .update(assetTags)
      .set({
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        updatedAt: new Date(input.timestamp),
      })
      .where(and(eq(assetTags.accountId, input.accountId), eq(assetTags.id, input.tagId), isNull(assetTags.deletedAt)))
      .returning()
    return row ? tagFromRow(row, await this.tagUsageCount(input.accountId, input.tagId)) : undefined
  }

  async useItem(input: { accountId: string; itemId: string; timestamp: string }) {
    const [row] = await this.db
      .update(assetLibraryItems)
      .set({
        lastUsedAt: new Date(input.timestamp),
        updatedAt: new Date(input.timestamp),
        usageCount: sql`${assetLibraryItems.usageCount} + 1`,
      })
      .where(
        and(
          eq(assetLibraryItems.accountId, input.accountId),
          eq(assetLibraryItems.id, input.itemId),
          isNull(assetLibraryItems.deletedAt),
          eq(assetLibraryItems.status, 'active'),
        ),
      )
      .returning({ id: assetLibraryItems.id })
    return row ? this.findItemById(input.accountId, input.itemId) : undefined
  }

  private async findFolderRow(db: QueryDb, accountId: string, folderId: string): Promise<AssetFolderRow | undefined> {
    const [row] = await db
      .select()
      .from(assetLibraryFolders)
      .where(
        and(
          eq(assetLibraryFolders.accountId, accountId),
          eq(assetLibraryFolders.id, folderId),
          isNull(assetLibraryFolders.deletedAt),
        ),
      )
      .limit(1)
    return row
  }

  private async findItemRow(db: QueryDb, accountId: string, itemId: string): Promise<AssetItemRow | undefined> {
    const [row] = await db
      .select()
      .from(assetLibraryItems)
      .where(and(eq(assetLibraryItems.accountId, accountId), eq(assetLibraryItems.id, itemId), isNull(assetLibraryItems.deletedAt)))
      .limit(1)
    return row
  }

  private async findTagRow(db: QueryDb, accountId: string, tagId: string): Promise<AssetTagRow | undefined> {
    const [row] = await db
      .select()
      .from(assetTags)
      .where(and(eq(assetTags.accountId, accountId), eq(assetTags.id, tagId), isNull(assetTags.deletedAt)))
      .limit(1)
    return row
  }

  private async folderAssetCount(accountId: string, folderId: string): Promise<number> {
    return this.folderCounts(accountId).then((counts) => counts.get(folderId) ?? 0)
  }

  private async folderCounts(accountId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ folderId: assetLibraryItems.folderId })
      .from(assetLibraryItems)
      .where(
        and(
          eq(assetLibraryItems.accountId, accountId),
          eq(assetLibraryItems.status, 'active'),
          isNull(assetLibraryItems.deletedAt),
          sql`${assetLibraryItems.folderId} is not null`,
        ),
      )
    const counts = new Map<string, number>()
    for (const row of rows) {
      if (row.folderId) {
        counts.set(row.folderId, (counts.get(row.folderId) ?? 0) + 1)
      }
    }
    return counts
  }

  private async loadItems(
    accountId: string,
    itemIds: string[],
    options: { activeOnly?: boolean } = {},
  ): Promise<AssetLibraryItemWithRelations[]> {
    if (itemIds.length === 0) {
      return []
    }
    const rows = await this.db
      .select({ item: assetLibraryItems, mediaObject: mediaObjects })
      .from(assetLibraryItems)
      .innerJoin(mediaObjects, eq(mediaObjects.id, assetLibraryItems.mediaObjectId))
      .where(
        and(
          eq(assetLibraryItems.accountId, accountId),
          eq(mediaObjects.accountId, accountId),
          inArray(assetLibraryItems.id, itemIds),
          isNull(assetLibraryItems.deletedAt),
          ...(options.activeOnly ? [eq(assetLibraryItems.status, 'active')] : []),
          eq(mediaObjects.status, 'ready'),
          isNull(mediaObjects.deletedAt),
        ),
      )
    return this.itemsWithRelations(accountId, rows.map((row) => ({ item: row.item, mediaObject: row.mediaObject })))
  }

  private async itemsWithRelations(
    accountId: string,
    rows: Array<{ item: AssetItemRow; mediaObject: MediaObjectRow }>,
  ): Promise<AssetLibraryItemWithRelations[]> {
    const folderIds = [...new Set(rows.map((row) => row.item.folderId).filter((value): value is string => Boolean(value)))]
    const itemIds = rows.map((row) => row.item.id)
    const folderRows =
      folderIds.length > 0
        ? await this.db
            .select()
            .from(assetLibraryFolders)
            .where(
              and(
                eq(assetLibraryFolders.accountId, accountId),
                inArray(assetLibraryFolders.id, folderIds),
                isNull(assetLibraryFolders.deletedAt),
              ),
            )
        : []
    const tagRows =
      itemIds.length > 0
        ? await this.db
            .select({ link: assetLibraryItemTags, tag: assetTags })
            .from(assetLibraryItemTags)
            .innerJoin(assetTags, eq(assetTags.id, assetLibraryItemTags.tagId))
            .where(and(eq(assetTags.accountId, accountId), inArray(assetLibraryItemTags.assetItemId, itemIds), isNull(assetTags.deletedAt)))
        : []
    const folders = new Map(folderRows.map((row) => [row.id, folderFromRow(row)]))
    const tagsByItem = new Map<string, AssetTag[]>()
    const counts = await this.tagCounts(accountId)
    for (const row of tagRows) {
      const tags = tagsByItem.get(row.link.assetItemId) ?? []
      tags.push(tagFromRow(row.tag, counts.get(row.tag.id) ?? 0))
      tagsByItem.set(row.link.assetItemId, tags)
    }
    return rows.map((row) => {
      const folder = row.item.folderId ? folders.get(row.item.folderId) : undefined
      return assetItemWithRelationsDto(itemFromRow(row.item), {
        ...(folder ? { folder } : {}),
        mediaObject: mediaObjectFromRow(row.mediaObject),
        tags: tagsByItem.get(row.item.id) ?? [],
      })
    })
  }

  private async refreshAllTagUsage(accountId: string): Promise<void> {
    const rows = await this.db
      .select({ id: assetTags.id })
      .from(assetTags)
      .where(and(eq(assetTags.accountId, accountId), isNull(assetTags.deletedAt)))
    await this.refreshTagUsageForIds(accountId, rows.map((row) => row.id))
  }

  private async refreshTagUsage(accountId: string, tagId: string): Promise<void> {
    const count = await this.tagUsageCount(accountId, tagId)
    await this.db
      .update(assetTags)
      .set({ usageCount: count })
      .where(and(eq(assetTags.accountId, accountId), eq(assetTags.id, tagId)))
  }

  private async refreshTagUsageForIds(accountId: string, tagIds: string[]): Promise<void> {
    for (const tagId of new Set(tagIds)) {
      await this.refreshTagUsage(accountId, tagId)
    }
  }

  private async tagCounts(accountId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ item: assetLibraryItems, link: assetLibraryItemTags })
      .from(assetLibraryItemTags)
      .innerJoin(assetLibraryItems, eq(assetLibraryItems.id, assetLibraryItemTags.assetItemId))
      .innerJoin(assetTags, eq(assetTags.id, assetLibraryItemTags.tagId))
      .where(
        and(
          eq(assetLibraryItems.accountId, accountId),
          eq(assetTags.accountId, accountId),
          eq(assetLibraryItems.status, 'active'),
          isNull(assetLibraryItems.deletedAt),
          isNull(assetTags.deletedAt),
        ),
      )
    const counts = new Map<string, number>()
    for (const row of rows) {
      counts.set(row.link.tagId, (counts.get(row.link.tagId) ?? 0) + 1)
    }
    return counts
  }

  private async tagUsageCount(accountId: string, tagId: string): Promise<number> {
    const counts = await this.tagCounts(accountId)
    return counts.get(tagId) ?? 0
  }

  private async touchItem(accountId: string, itemId: string, timestamp: string): Promise<void> {
    await this.db
      .update(assetLibraryItems)
      .set({ updatedAt: new Date(timestamp) })
      .where(and(eq(assetLibraryItems.accountId, accountId), eq(assetLibraryItems.id, itemId)))
  }
}
