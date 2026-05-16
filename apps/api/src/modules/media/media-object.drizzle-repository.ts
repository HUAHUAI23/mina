import { and, eq, isNull, lte, sum } from 'drizzle-orm'

import type { MinaDbClient } from '../../db/client'
import { mediaObjects } from '../../db/schema'
import { MediaObjectSchema, type MediaObject, type MediaObjectStatus } from './media-object'
import type { MediaObjectRepository } from './media-object.repository'

type MediaObjectRow = typeof mediaObjects.$inferSelect
type MediaObjectInsert = typeof mediaObjects.$inferInsert

const toIso = (value: Date): string => value.toISOString()
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

const mediaObjectInsertFromMediaObject = (mediaObject: MediaObject): MediaObjectInsert => ({
  id: mediaObject.id,
  accountId: mediaObject.accountId,
  kind: mediaObject.kind,
  status: mediaObject.status,
  bucket: mediaObject.bucket,
  storageKey: mediaObject.storageKey,
  url: mediaObject.url,
  mimeType: mediaObject.mimeType ?? null,
  byteSize: mediaObject.byteSize,
  checksum: mediaObject.checksum ?? null,
  width: mediaObject.width ?? null,
  height: mediaObject.height ?? null,
  durationSeconds: mediaObject.durationSeconds === undefined ? null : String(mediaObject.durationSeconds),
  origin: mediaObject.origin,
  purpose: mediaObject.purpose,
  retention: mediaObject.retention,
  parentMediaObjectId: mediaObject.parentMediaObjectId ?? null,
  sourceTaskId: mediaObject.sourceTaskId ?? null,
  sourceTaskResourceId: mediaObject.sourceTaskResourceId ?? null,
  metadata: mediaObject.metadata ?? null,
  expiresAt: toDate(mediaObject.expiresAt),
  deletedAt: toDate(mediaObject.deletedAt),
  createdAt: new Date(mediaObject.createdAt),
  updatedAt: new Date(mediaObject.updatedAt),
})

export class DrizzleMediaObjectRepository implements MediaObjectRepository {
  constructor(private readonly db: MinaDbClient) {}

  async create(mediaObject: MediaObject): Promise<MediaObject> {
    await this.db.insert(mediaObjects).values(mediaObjectInsertFromMediaObject(mediaObject))
    return mediaObject
  }

  async findById(accountId: string, id: string): Promise<MediaObject | undefined> {
    const [row] = await this.db
      .select()
      .from(mediaObjects)
      .where(and(eq(mediaObjects.accountId, accountId), eq(mediaObjects.id, id)))
      .limit(1)
    return row ? mediaObjectFromRow(row) : undefined
  }

  async getAccountStorageUsage(accountId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: sum(mediaObjects.byteSize) })
      .from(mediaObjects)
      .where(
        and(eq(mediaObjects.accountId, accountId), eq(mediaObjects.status, 'ready'), isNull(mediaObjects.deletedAt)),
      )
    return Number(row?.total ?? 0)
  }

  async listExpiredUploading(cutoffIso: string): Promise<MediaObject[]> {
    const cutoff = new Date(cutoffIso)
    const rows = await this.db
      .select()
      .from(mediaObjects)
      .where(
        and(
          eq(mediaObjects.status, 'uploading'),
          lte(mediaObjects.expiresAt, cutoff),
        ),
      )
    return rows.map(mediaObjectFromRow)
  }

  async softDelete(accountId: string, id: string, deletedAtIso: string): Promise<void> {
    await this.db
      .update(mediaObjects)
      .set({ deletedAt: new Date(deletedAtIso), status: 'deleted', updatedAt: new Date(deletedAtIso) })
      .where(and(eq(mediaObjects.accountId, accountId), eq(mediaObjects.id, id)))
  }

  async updateStatus(
    accountId: string,
    id: string,
    status: MediaObjectStatus,
    updatedAtIso: string,
  ): Promise<MediaObject> {
    const [row] = await this.db
      .update(mediaObjects)
      .set({
        status,
        ...(status === 'deleted' ? { deletedAt: new Date(updatedAtIso) } : {}),
        updatedAt: new Date(updatedAtIso),
      })
      .where(and(eq(mediaObjects.accountId, accountId), eq(mediaObjects.id, id)))
      .returning()
    if (!row) {
      throw new Error('Media object not found.')
    }
    return mediaObjectFromRow(row)
  }
}
