import type { ChatMessagePart } from '@mina/contracts/modules/chat'

import type { WebMessages } from '../../../../lib/i18n-messages'

type ChatErrorPart = Extract<ChatMessagePart, { type: 'error' }>
type ChatErrorMessageResolver = (messages: WebMessages) => string

const chatErrorMessageByKey = {
  chat_error_ai_not_configured: (m) => m.chat_error_ai_not_configured(),
  chat_error_ai_provider_auth_failed: (m) => m.chat_error_ai_provider_auth_failed(),
  chat_error_ai_provider_rate_limited: (m) => m.chat_error_ai_provider_rate_limited(),
  chat_error_ai_provider_timeout: (m) => m.chat_error_ai_provider_timeout(),
  chat_error_ai_provider_network: (m) => m.chat_error_ai_provider_network(),
  chat_error_ai_provider_unavailable: (m) => m.chat_error_ai_provider_unavailable(),
  chat_error_ai_model_invalid: (m) => m.chat_error_ai_model_invalid(),
  chat_error_ai_context_too_large: (m) => m.chat_error_ai_context_too_large(),
  chat_error_ai_attachment_read_failed: (m) => m.chat_error_ai_attachment_read_failed(),
  chat_error_ai_response_persist_failed: (m) => m.chat_error_ai_response_persist_failed(),
  chat_error_assistant_response_failed: (m) => m.chat_error_assistant_response_failed(),
} satisfies Record<string, ChatErrorMessageResolver>

type KnownChatErrorMessageKey = keyof typeof chatErrorMessageByKey

const isKnownChatErrorMessageKey = (key: string): key is KnownChatErrorMessageKey =>
  key in chatErrorMessageByKey

export const getChatErrorMessage = (part: ChatErrorPart, messages: WebMessages): string => {
  const resolver = part.messageKey && isKnownChatErrorMessageKey(part.messageKey)
    ? chatErrorMessageByKey[part.messageKey]
    : undefined
  return resolver ? resolver(messages) : part.message
}
