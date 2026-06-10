import type { CreateChatMessageInput } from '@mina/contracts/modules/chat'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { useMessages } from '../../../../app/i18n-provider'
import { getErrorMessage } from '../../../../lib/http'
import { uploadMediaObject } from '../../api/media-mutations'
import { createChatMessage } from '../api/chat-client'
import { chatKeys } from '../api/chat-keys'
import {
  CHAT_ATTACHMENT_MAX_BYTES,
  chatAttachmentLimit,
  draftAttachmentsToMessageParts,
  formatAttachmentBytes,
  planChatAttachmentFiles,
  readyDraftAttachments,
} from '../domain/chat-attachments'
import {
  createOptimisticChatMessage,
  upsertChatMessage,
  type AgentChatMessageListCache,
} from '../domain/chat-message-cache'
import { useAgentChatUiStore, type AgentChatDraftAttachment } from '../store/agent-chat-ui-store'

export interface AgentChatComposerController {
  attachFiles(files: FileList | File[]): void
  canSend: boolean
  closeComposer(): void
  draftAttachments: AgentChatDraftAttachment[]
  draftText: string
  hasUploading: boolean
  removeDraftAttachment(id: string): void
  retryAttachment(attachment: AgentChatDraftAttachment): void
  sendPending: boolean
  setDraftText(value: string): void
  submit(): void
  visibleError: string | undefined
}

export const useAgentChatComposer = (threadId: string | undefined): AgentChatComposerController => {
  const m = useMessages()
  const queryClient = useQueryClient()
  const closeComposer = useAgentChatUiStore((state) => state.closeComposer)
  const draftText = useAgentChatUiStore((state) => state.draftText)
  const draftAttachments = useAgentChatUiStore((state) => state.draftAttachments)
  const addDraftAttachment = useAgentChatUiStore((state) => state.addDraftAttachment)
  const clearDraft = useAgentChatUiStore((state) => state.clearDraft)
  const removeDraftAttachment = useAgentChatUiStore((state) => state.removeDraftAttachment)
  const setDraftText = useAgentChatUiStore((state) => state.setDraftText)
  const updateDraftAttachment = useAgentChatUiStore((state) => state.updateDraftAttachment)

  const uploadAttachment = useCallback((file: File, attachmentId: string) => {
    void uploadMediaObject(file, { purpose: 'chat_attachment' })
      .then((response) => {
        updateDraftAttachment(attachmentId, {
          mediaObject: response.item,
          status: 'ready',
        })
      })
      .catch((error) => {
        updateDraftAttachment(attachmentId, {
          error: getErrorMessage(error, m.workflow_canvas_agent_upload_failed()),
          status: 'error',
        })
      })
  }, [m, updateDraftAttachment])

  const attachmentErrorMessage = useCallback((error: 'limit' | 'size') => {
    if (error === 'limit') {
      return m.workflow_canvas_agent_attachment_limit({
        count: chatAttachmentLimit(Boolean(draftText.trim())),
      })
    }
    return m.workflow_canvas_agent_attachment_too_large({
      size: formatAttachmentBytes(CHAT_ATTACHMENT_MAX_BYTES) ?? '100 MB',
    })
  }, [draftText, m])

  const sendMutation = useMutation({
    mutationFn: async (input: { message: CreateChatMessageInput; threadId: string }) =>
      createChatMessage(input.threadId, input.message),
    onMutate: async (input) => {
      const submittedText = draftText
      const submittedAttachments = readyDraftAttachments(draftAttachments)
      await queryClient.cancelQueries({ queryKey: chatKeys.messages(input.threadId) })
      const previous = queryClient.getQueryData<AgentChatMessageListCache>(chatKeys.messages(input.threadId))
      const optimisticOrderIndex = (previous?.items.reduce(
        (latest, message) => Math.max(latest, message.orderIndex),
        -1,
      ) ?? -1) + 1
      queryClient.setQueryData<AgentChatMessageListCache>(
        chatKeys.messages(input.threadId),
        (current) => upsertChatMessage(
          current,
          createOptimisticChatMessage(input.threadId, input.message, optimisticOrderIndex),
        ),
      )
      clearDraft()
      return { previous, submittedAttachments, submittedText }
    },
    onError: (_error, input, context) => {
      queryClient.setQueryData(chatKeys.messages(input.threadId), context?.previous)
      const currentDraft = useAgentChatUiStore.getState()
      if (context && !currentDraft.draftText.trim() && currentDraft.draftAttachments.length === 0) {
        setDraftText(context.submittedText)
        for (const attachment of context.submittedAttachments) {
          addDraftAttachment(attachment)
        }
      }
    },
    onSuccess: (response, input) => {
      queryClient.setQueryData<AgentChatMessageListCache>(
        chatKeys.messages(input.threadId),
        (current) => upsertChatMessage(current, response.item),
      )
    },
  })

  const attachFiles = useCallback((files: FileList | File[]) => {
    const planned = planChatAttachmentFiles({
      currentAttachmentCount: draftAttachments.length,
      files: Array.from(files),
      hasTextPart: Boolean(draftText.trim()),
      idFactory: () => crypto.randomUUID(),
    })
    for (const item of planned) {
      const attachment = item.status === 'error'
        ? { ...item.attachment, error: attachmentErrorMessage(item.error) }
        : item.attachment
      addDraftAttachment(attachment)
      if (item.status === 'upload') {
        uploadAttachment(item.file, item.attachment.id)
      }
    }
  }, [addDraftAttachment, attachmentErrorMessage, draftAttachments.length, draftText, uploadAttachment])

  const retryAttachment = useCallback((attachment: AgentChatDraftAttachment) => {
    if (!attachment.file) {
      return
    }
    updateDraftAttachment(attachment.id, { error: undefined, status: 'uploading' })
    uploadAttachment(attachment.file, attachment.id)
  }, [updateDraftAttachment, uploadAttachment])

  const submit = useCallback(() => {
    if (!threadId || sendMutation.isPending) {
      return
    }
    const text = draftText.trim()
    const readyAttachments = readyDraftAttachments(draftAttachments)
    if (!text && readyAttachments.length === 0) {
      return
    }
    const parts: CreateChatMessageInput['parts'] = [
      ...(text ? [{ type: 'text' as const, text }] : []),
      ...draftAttachmentsToMessageParts(readyAttachments),
    ]
    sendMutation.mutate({
      message: {
        clientMessageId: crypto.randomUUID(),
        parts,
      },
      threadId,
    })
  }, [draftAttachments, draftText, sendMutation, threadId])

  const hasUploading = draftAttachments.some((attachment) => attachment.status === 'uploading')
  const hasReady = readyDraftAttachments(draftAttachments).length > 0
  const canSend = Boolean(threadId) && !hasUploading && Boolean(draftText.trim() || hasReady)
  const visibleError = sendMutation.isError
    ? getErrorMessage(sendMutation.error, m.workflow_canvas_agent_message_failed())
    : undefined

  return {
    attachFiles,
    canSend,
    closeComposer,
    draftAttachments,
    draftText,
    hasUploading,
    removeDraftAttachment,
    retryAttachment,
    sendPending: sendMutation.isPending,
    setDraftText,
    submit,
    visibleError,
  }
}
