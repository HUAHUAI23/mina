import type { MediaObject } from '../../modules/media/media-object'

const defaultTimestamp = '2026-01-01T00:00:00.000Z'

export const buildReadyMediaObject = (
  patch: Partial<MediaObject> & Pick<MediaObject, 'accountId' | 'id' | 'kind'>,
): MediaObject => ({
  accountId: patch.accountId,
  bucket: patch.bucket ?? 'bucket',
  byteSize: patch.byteSize ?? 1,
  createdAt: patch.createdAt ?? defaultTimestamp,
  id: patch.id,
  kind: patch.kind,
  origin: patch.origin ?? 'user_upload',
  purpose: patch.purpose ?? 'workflow_slot',
  retention: patch.retention ?? 'project_scoped',
  status: 'ready',
  storageKey: patch.storageKey ?? `users/${patch.accountId}/media/${patch.id}/original`,
  updatedAt: patch.updatedAt ?? defaultTimestamp,
  url: patch.url ?? `s3://bucket/users/${patch.accountId}/media/${patch.id}/original`,
  ...(patch.checksum ? { checksum: patch.checksum } : {}),
  ...(patch.deletedAt ? { deletedAt: patch.deletedAt } : {}),
  ...(patch.expiresAt ? { expiresAt: patch.expiresAt } : {}),
  ...(patch.metadata ? { metadata: patch.metadata } : {}),
  ...(patch.mimeType ? { mimeType: patch.mimeType } : {}),
})
