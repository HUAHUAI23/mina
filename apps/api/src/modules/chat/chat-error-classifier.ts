import type { ChatAssistantErrorCode } from '@mina/contracts/modules/chat'

import { ObjectStorageReadLimitError } from '../../lib/storage/object-storage'

export interface ChatAssistantErrorClassification {
  code: ChatAssistantErrorCode
  debugMessage: string
  message: string
  messageKey: string
  params?: Record<string, string | number | boolean>
  retryable: boolean
}

export class ClassifiedChatAssistantError extends Error {
  readonly classification: ChatAssistantErrorClassification

  constructor(classification: ChatAssistantErrorClassification) {
    super(classification.message)
    this.name = 'ClassifiedChatAssistantError'
    this.classification = classification
  }
}

const defaultMessageForCode = (code: ChatAssistantErrorCode): string => {
  switch (code) {
    case 'AI_NOT_CONFIGURED':
      return 'AI service is not configured for this Mina instance.'
    case 'AI_PROVIDER_AUTH_FAILED':
      return 'AI service authentication failed.'
    case 'AI_PROVIDER_RATE_LIMITED':
      return 'AI service is busy.'
    case 'AI_PROVIDER_TIMEOUT':
      return 'AI response timed out.'
    case 'AI_PROVIDER_NETWORK':
      return 'Network connection to the AI service failed.'
    case 'AI_PROVIDER_UNAVAILABLE':
      return 'AI service is temporarily unavailable.'
    case 'AI_MODEL_INVALID':
      return 'The selected AI model is unavailable.'
    case 'AI_CONTEXT_TOO_LARGE':
      return 'The conversation is too large for the selected AI model.'
    case 'AI_ATTACHMENT_READ_FAILED':
      return 'One attachment could not be read.'
    case 'AI_RESPONSE_PERSIST_FAILED':
      return 'The AI response could not be saved.'
    case 'CHAT_ASSISTANT_RESPONSE_FAILED':
      return 'The assistant could not complete this response.'
  }
}

export const chatAssistantMessageKeyForCode = (code: ChatAssistantErrorCode): string => {
  switch (code) {
    case 'AI_NOT_CONFIGURED':
      return 'chat_error_ai_not_configured'
    case 'AI_PROVIDER_AUTH_FAILED':
      return 'chat_error_ai_provider_auth_failed'
    case 'AI_PROVIDER_RATE_LIMITED':
      return 'chat_error_ai_provider_rate_limited'
    case 'AI_PROVIDER_TIMEOUT':
      return 'chat_error_ai_provider_timeout'
    case 'AI_PROVIDER_NETWORK':
      return 'chat_error_ai_provider_network'
    case 'AI_PROVIDER_UNAVAILABLE':
      return 'chat_error_ai_provider_unavailable'
    case 'AI_MODEL_INVALID':
      return 'chat_error_ai_model_invalid'
    case 'AI_CONTEXT_TOO_LARGE':
      return 'chat_error_ai_context_too_large'
    case 'AI_ATTACHMENT_READ_FAILED':
      return 'chat_error_ai_attachment_read_failed'
    case 'AI_RESPONSE_PERSIST_FAILED':
      return 'chat_error_ai_response_persist_failed'
    case 'CHAT_ASSISTANT_RESPONSE_FAILED':
      return 'chat_error_assistant_response_failed'
  }
}

const retryableCodes = new Set<ChatAssistantErrorCode>([
  'AI_PROVIDER_RATE_LIMITED',
  'AI_PROVIDER_TIMEOUT',
  'AI_PROVIDER_NETWORK',
  'AI_PROVIDER_UNAVAILABLE',
  'AI_ATTACHMENT_READ_FAILED',
  'AI_RESPONSE_PERSIST_FAILED',
])

const MAX_ERROR_TRAVERSAL_DEPTH = 4
const NESTED_ERROR_FIELDS = ['cause', 'error', 'response'] as const
const ERROR_MESSAGE_FIELDS = ['message', 'statusText', 'responseBody', 'body', 'detail'] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object')

const statusValue = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

const statusFromError = (
  error: unknown,
  depth = 0,
  seen = new Set<object>(),
): number | undefined => {
  if (!isRecord(error) || depth > MAX_ERROR_TRAVERSAL_DEPTH || seen.has(error)) {
    return undefined
  }
  seen.add(error)
  const status = statusValue(error.status) ?? statusValue(error.statusCode)
  if (status !== undefined) {
    return status
  }
  for (const field of NESTED_ERROR_FIELDS) {
    const nestedStatus = statusFromError(error[field], depth + 1, seen)
    if (nestedStatus !== undefined) {
      return nestedStatus
    }
  }
  return undefined
}

const messageFromError = (error: unknown): string => {
  const messages: string[] = []
  collectErrorMessages(error, messages)
  if (messages.length > 0) {
    return messages.join(' | ')
  }
  if (error instanceof Error) {
    return error.message
  }
  return typeof error === 'string' ? error : 'Unknown assistant response failure.'
}

const collectErrorMessages = (
  error: unknown,
  messages: string[],
  depth = 0,
  seen = new Set<object>(),
): void => {
  if (typeof error === 'string') {
    messages.push(error)
    return
  }
  if (!isRecord(error) || depth > MAX_ERROR_TRAVERSAL_DEPTH || seen.has(error)) {
    return
  }
  seen.add(error)
  for (const field of ERROR_MESSAGE_FIELDS) {
    const value = error[field]
    if (typeof value === 'string' && value.trim()) {
      messages.push(value)
    }
  }
  for (const field of NESTED_ERROR_FIELDS) {
    collectErrorMessages(error[field], messages, depth + 1, seen)
  }
}

export const classifyChatAssistantError = (
  error: unknown,
  fallbackCode: ChatAssistantErrorCode = 'CHAT_ASSISTANT_RESPONSE_FAILED',
): ChatAssistantErrorClassification => {
  if (error instanceof ClassifiedChatAssistantError) {
    return error.classification
  }
  if (error instanceof ObjectStorageReadLimitError) {
    return toClassification('AI_ATTACHMENT_READ_FAILED', error.message)
  }

  const status = statusFromError(error)
  const message = messageFromError(error)
  const normalized = message.toLowerCase()

  if (status === 401 || status === 403 || normalized.includes('api key') || normalized.includes('unauthorized')) {
    return toClassification('AI_PROVIDER_AUTH_FAILED', message)
  }
  if (status === 404 || normalized.includes('model') && normalized.includes('not found')) {
    return toClassification('AI_MODEL_INVALID', message)
  }
  if (status === 408 || normalized.includes('timeout') || normalized.includes('timed out')) {
    return toClassification('AI_PROVIDER_TIMEOUT', message)
  }
  if (status === 409 || status === 413 || normalized.includes('context') && normalized.includes('length')) {
    return toClassification('AI_CONTEXT_TOO_LARGE', message)
  }
  if (status === 429 || normalized.includes('rate limit') || normalized.includes('too many requests')) {
    return toClassification('AI_PROVIDER_RATE_LIMITED', message)
  }
  if (status !== undefined && status >= 500) {
    return toClassification('AI_PROVIDER_UNAVAILABLE', message)
  }
  if (
    normalized.includes('fetch failed') ||
    normalized.includes('network') ||
    normalized.includes('econnreset') ||
    normalized.includes('enotfound') ||
    normalized.includes('socket')
  ) {
    return toClassification('AI_PROVIDER_NETWORK', message)
  }

  return toClassification(fallbackCode, message)
}

export const toClassification = (
  code: ChatAssistantErrorCode,
  debugMessage: string,
  params?: Record<string, string | number | boolean>,
): ChatAssistantErrorClassification => ({
  code,
  debugMessage,
  message: defaultMessageForCode(code),
  messageKey: chatAssistantMessageKeyForCode(code),
  ...(params ? { params } : {}),
  retryable: retryableCodes.has(code),
})
