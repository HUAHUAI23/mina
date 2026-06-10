import { describe, expect, test } from 'bun:test'
import type { MediaObject } from '@mina/contracts/modules/media/media-object'

import type { AgentChatDraftAttachment } from '../store/agent-chat-ui-store'
import {
  CHAT_ATTACHMENT_MAX_BYTES,
  CHAT_MESSAGE_PART_LIMIT,
  draftAttachmentsToMessageParts,
  formatAttachmentBytes,
  planChatAttachmentFiles,
  readyDraftAttachments,
} from './chat-attachments'

const mediaObject = (patch: Partial<MediaObject> & Pick<MediaObject, 'id'>): MediaObject => ({
  accountId: 'account_1',
  bucket: 'bucket',
  byteSize: patch.byteSize ?? 1024,
  createdAt: '2026-01-01T00:00:00.000Z',
  id: patch.id,
  kind: patch.kind ?? 'file',
  origin: 'user_upload',
  purpose: 'chat_attachment',
  retention: 'project_scoped',
  status: 'ready',
  storageKey: `users/account_1/${patch.id}`,
  updatedAt: '2026-01-01T00:00:00.000Z',
  url: `mina://media/${patch.id}`,
  ...(patch.mimeType ? { mimeType: patch.mimeType } : {}),
})

const attachment = (
  patch: Partial<AgentChatDraftAttachment> & Pick<AgentChatDraftAttachment, 'id'>,
): AgentChatDraftAttachment => ({
  fileName: patch.fileName ?? `${patch.id}.txt`,
  id: patch.id,
  mimeType: patch.mimeType ?? 'text/plain',
  size: patch.size ?? 1024,
  status: patch.status ?? 'ready',
  ...(patch.error ? { error: patch.error } : {}),
  ...(patch.file ? { file: patch.file } : {}),
  ...(patch.mediaObject ? { mediaObject: patch.mediaObject } : {}),
})

describe('chat attachment helpers', () => {
  test('filters only ready attachments that have media objects', () => {
    const ready = attachment({ id: 'ready', mediaObject: mediaObject({ id: 'media_ready' }) })
    const uploading = attachment({ id: 'uploading', mediaObject: mediaObject({ id: 'media_uploading' }), status: 'uploading' })
    const missingMedia = attachment({ id: 'missing_media' })

    expect(readyDraftAttachments([ready, uploading, missingMedia]).map((item) => item.id)).toEqual(['ready'])
  })

  test('converts image media objects to image parts and other media to file parts', () => {
    const parts = draftAttachmentsToMessageParts([
      attachment({
        fileName: 'reference.png',
        id: 'image',
        mediaObject: mediaObject({ id: 'media_image', kind: 'image', mimeType: 'image/png' }),
        mimeType: 'image/png',
      }),
      attachment({
        fileName: 'brief.pdf',
        id: 'file',
        mediaObject: mediaObject({ id: 'media_file', kind: 'file', mimeType: 'application/pdf' }),
        mimeType: 'application/pdf',
      }),
    ])

    expect(parts).toEqual([
      { alt: 'reference.png', mediaObjectId: 'media_image', type: 'image' },
      { mediaObjectId: 'media_file', name: 'brief.pdf', type: 'file' },
    ])
  })

  test('formats attachment sizes with stable units', () => {
    expect(formatAttachmentBytes(undefined)).toBeUndefined()
    expect(formatAttachmentBytes(900)).toBe('900 B')
    expect(formatAttachmentBytes(1536)).toBe('1.5 KB')
    expect(formatAttachmentBytes(2_621_440)).toBe('2.5 MB')
  })

  test('plans uploadable files within the message part limit', () => {
    let nextId = 0
    const files = Array.from({ length: 2 }, (_unused, index) =>
      new File(['ok'], `file-${index}.txt`, { type: 'text/plain' })
    )

    const planned = planChatAttachmentFiles({
      currentAttachmentCount: CHAT_MESSAGE_PART_LIMIT - 2,
      files,
      hasTextPart: true,
      idFactory: () => `attachment_${nextId += 1}`,
    })

    expect(planned.map((item) => item.status)).toEqual(['upload', 'error'])
    expect(planned[1]?.status === 'error' ? planned[1].error : undefined).toBe('limit')
  })

  test('reserves one message part for text when planning attachments', () => {
    const planned = planChatAttachmentFiles({
      currentAttachmentCount: CHAT_MESSAGE_PART_LIMIT - 1,
      files: [new File(['ok'], 'extra.txt', { type: 'text/plain' })],
      hasTextPart: true,
      idFactory: () => 'attachment_limit',
    })

    expect(planned[0]?.status).toBe('error')
    expect(planned[0]?.status === 'error' ? planned[0].error : undefined).toBe('limit')
  })

  test('marks oversized files as errors without scheduling an upload', () => {
    const planned = planChatAttachmentFiles({
      currentAttachmentCount: 0,
      files: [new File(['x'], 'large.bin', { type: 'application/octet-stream' })],
      hasTextPart: false,
      idFactory: () => 'attachment_large',
      maxBytes: 0,
    })

    expect(planned[0]?.status).toBe('error')
    expect(planned[0]?.status === 'error' ? planned[0].error : undefined).toBe('size')
    expect(planned[0]?.attachment.size).toBeLessThanOrEqual(CHAT_ATTACHMENT_MAX_BYTES)
  })
})
