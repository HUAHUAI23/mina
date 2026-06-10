import type { CreateChatMessageInput } from '@mina/contracts/modules/chat'
import type { MediaObject } from '@mina/contracts/modules/media/media-object'

import type { AgentChatDraftAttachment } from '../store/agent-chat-ui-store'

export const CHAT_MESSAGE_PART_LIMIT = 32
export const CHAT_ATTACHMENT_MAX_BYTES = 100 * 1024 * 1024

export const isImageMimeType = (mimeType: string | undefined): boolean =>
  Boolean(mimeType?.startsWith('image/'))

export const formatAttachmentBytes = (value: number | undefined): string | undefined => {
  if (value === undefined) {
    return undefined
  }
  if (value < 1024) {
    return `${value} B`
  }
  if (value < 1024 * 1024) {
    return `${Math.round(value / 102.4) / 10} KB`
  }
  return `${Math.round(value / 1024 / 102.4) / 10} MB`
}

const attachmentMediaObject = (attachment: AgentChatDraftAttachment): MediaObject => {
  if (!attachment.mediaObject) {
    throw new Error('Ready attachment is missing media object.')
  }
  return attachment.mediaObject
}

export const readyDraftAttachments = (
  attachments: AgentChatDraftAttachment[],
): AgentChatDraftAttachment[] =>
  attachments.filter((attachment) => attachment.status === 'ready' && attachment.mediaObject)

export const draftAttachmentsToMessageParts = (
  attachments: AgentChatDraftAttachment[],
): CreateChatMessageInput['parts'] =>
  readyDraftAttachments(attachments).map((attachment) => {
    const mediaObject = attachmentMediaObject(attachment)
    return mediaObject.kind === 'image'
      ? { type: 'image' as const, mediaObjectId: mediaObject.id, alt: attachment.fileName }
      : { type: 'file' as const, mediaObjectId: mediaObject.id, name: attachment.fileName }
  })

export type ChatAttachmentPlanError = 'limit' | 'size'

export type PlannedChatAttachment =
  | {
      attachment: AgentChatDraftAttachment
      file: File
      status: 'upload'
    }
  | {
      attachment: AgentChatDraftAttachment
      error: ChatAttachmentPlanError
      status: 'error'
    }

export const chatAttachmentLimit = (hasTextPart: boolean): number =>
  hasTextPart ? CHAT_MESSAGE_PART_LIMIT - 1 : CHAT_MESSAGE_PART_LIMIT

export const planChatAttachmentFiles = (input: {
  currentAttachmentCount: number
  files: readonly File[]
  hasTextPart: boolean
  idFactory: () => string
  maxBytes?: number
}): PlannedChatAttachment[] => {
  const maxBytes = input.maxBytes ?? CHAT_ATTACHMENT_MAX_BYTES
  const maxAttachments = chatAttachmentLimit(input.hasTextPart)
  let acceptedCount = input.currentAttachmentCount

  return input.files.map((file) => {
    const attachmentBase = {
      fileName: file.name || 'attachment',
      file,
      id: input.idFactory(),
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
    }
    if (acceptedCount >= maxAttachments) {
      return {
        attachment: {
          ...attachmentBase,
          status: 'error' as const,
        },
        error: 'limit' as const,
        status: 'error' as const,
      }
    }
    if (file.size > maxBytes) {
      return {
        attachment: {
          ...attachmentBase,
          status: 'error' as const,
        },
        error: 'size' as const,
        status: 'error' as const,
      }
    }
    acceptedCount += 1
    return {
      attachment: {
        ...attachmentBase,
        status: 'uploading' as const,
      },
      file,
      status: 'upload' as const,
    }
  })
}
