import {
  ChatMessageListResponseSchema,
  ChatMessageResponseSchema,
  ChatThreadListResponseSchema,
  ChatThreadResponseSchema,
  type ChatMessageListResponse,
  type ChatMessageResponse,
  type ChatThreadListResponse,
  type ChatThreadResponse,
  type CreateChatMessageInput,
} from '@mina/contracts/modules/chat'

import { apiClient } from '../../../../lib/api-client'
import { readJson } from '../../../../lib/http'
import { getCurrentLocaleForRequest } from '../../../../app/locale-storage'
import { readStoredAuthToken } from '../../../auth/auth-session'
import { getAgentChatClientId } from './chat-ws'

export const listChatThreads = async (workflowId: string): Promise<ChatThreadListResponse> => {
  const response = await apiClient.api.chat.threads.$get({ query: { workflowId } })
  return readJson(response, ChatThreadListResponseSchema)
}

export const createChatThread = async (workflowId: string): Promise<ChatThreadResponse> => {
  const response = await apiClient.api.chat.threads.$post({ json: { workflowId } })
  return readJson(response, ChatThreadResponseSchema)
}

export const listChatMessages = async (
  threadId: string,
  query: { cursor?: string; limit?: number } = {},
): Promise<ChatMessageListResponse> => {
  const response = await apiClient.api.chat.threads[':threadId'].messages.$get({
    param: { threadId },
    query: {
      ...(query.cursor ? { cursor: query.cursor } : {}),
      limit: query.limit ?? 50,
    },
  })
  return readJson(response, ChatMessageListResponseSchema)
}

export const createChatMessage = async (
  threadId: string,
  input: CreateChatMessageInput,
): Promise<ChatMessageResponse> => {
  const token = readStoredAuthToken()
  const response = await apiClient.api.chat.threads[':threadId'].messages.$post({
    json: input,
    param: { threadId },
  }, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Mina-Client-Id': getAgentChatClientId(),
      'X-Mina-Locale': getCurrentLocaleForRequest(),
    },
  })
  return readJson(response, ChatMessageResponseSchema)
}

export const retryChatMessage = async (
  threadId: string,
  messageId: string,
): Promise<ChatMessageResponse> => {
  const token = readStoredAuthToken()
  const response = await apiClient.api.chat.threads[':threadId'].messages[':messageId'].retry.$post({
    param: { messageId, threadId },
  }, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Mina-Locale': getCurrentLocaleForRequest(),
    },
  })
  return readJson(response, ChatMessageResponseSchema)
}
