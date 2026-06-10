import { z } from 'zod'

const isoDateTime = z.string().datetime()
const id = z.string().min(1)

export const ChatThreadStatusSchema = z.enum(['active', 'archived'])
export const ChatMessageRoleSchema = z.enum(['user', 'assistant', 'system'])
export const ChatMessageStatusSchema = z.enum(['streaming', 'sent', 'retrying', 'failed', 'deleted'])
export const ChatAssistantErrorCodeSchema = z.enum([
  'AI_NOT_CONFIGURED',
  'AI_PROVIDER_AUTH_FAILED',
  'AI_PROVIDER_RATE_LIMITED',
  'AI_PROVIDER_TIMEOUT',
  'AI_PROVIDER_NETWORK',
  'AI_PROVIDER_UNAVAILABLE',
  'AI_MODEL_INVALID',
  'AI_CONTEXT_TOO_LARGE',
  'AI_ATTACHMENT_READ_FAILED',
  'AI_RESPONSE_PERSIST_FAILED',
  'CHAT_ASSISTANT_RESPONSE_FAILED',
])
export const ChatAssistantRetryStateSchema = z.enum(['none', 'retrying', 'exhausted'])

export const ChatTextPartSchema = z.object({
  type: z.literal('text'),
  text: z.string().trim().max(20_000),
})

export const CreateChatTextPartSchema = z.object({
  type: z.literal('text'),
  text: z.string().trim().min(1).max(20_000),
})

export const ChatImagePartSchema = z.object({
  type: z.literal('image'),
  mediaObjectId: id,
  alt: z.string().trim().max(500).optional(),
  byteSize: z.number().int().nonnegative().optional(),
  height: z.number().int().positive().optional(),
  mimeType: z.string().min(1).optional(),
  width: z.number().int().positive().optional(),
})

export const ChatFilePartSchema = z.object({
  type: z.literal('file'),
  mediaObjectId: id,
  name: z.string().trim().min(1).max(500),
  byteSize: z.number().int().nonnegative().optional(),
  mimeType: z.string().min(1).optional(),
})

export const ChatErrorPartSchema = z.object({
  type: z.literal('error'),
  code: ChatAssistantErrorCodeSchema.optional(),
  message: z.string().trim().min(1).max(2_000),
  messageKey: z.string().trim().min(1).max(200).optional(),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  retryable: z.boolean().optional(),
  retryState: ChatAssistantRetryStateSchema.optional(),
})

export const ChatMessagePartSchema = z.discriminatedUnion('type', [
  ChatTextPartSchema,
  ChatImagePartSchema,
  ChatFilePartSchema,
  ChatErrorPartSchema,
])

export const CreateChatMessagePartSchema = z.discriminatedUnion('type', [
  CreateChatTextPartSchema,
  z.object({
    type: z.literal('image'),
    mediaObjectId: id,
    alt: z.string().trim().max(500).optional(),
  }),
  z.object({
    type: z.literal('file'),
    mediaObjectId: id,
    name: z.string().trim().min(1).max(500).optional(),
  }),
])

export const ChatThreadSchema = z.object({
  id,
  accountId: id,
  workflowId: id.optional(),
  title: z.string().min(1).optional(),
  status: ChatThreadStatusSchema,
  lastMessageAt: isoDateTime.optional(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})

export const ChatMessageSchema = z.object({
  id,
  threadId: id,
  accountId: id,
  role: ChatMessageRoleSchema,
  status: ChatMessageStatusSchema,
  orderIndex: z.number().int().nonnegative(),
  clientMessageId: id.optional(),
  parts: z.array(ChatMessagePartSchema).min(1),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})

export const CreateChatThreadSchema = z.object({
  workflowId: id.optional(),
  title: z.string().trim().min(1).max(200).optional(),
})

export const ListChatThreadsQuerySchema = z.object({
  workflowId: id.optional(),
})

export const ChatThreadParamsSchema = z.object({
  threadId: id,
})

export const ChatMessageParamsSchema = z.object({
  messageId: id,
  threadId: id,
})

export const CreateChatMessageSchema = z.object({
  assistantResponse: z.boolean().optional(),
  clientMessageId: id.optional(),
  parts: z.array(CreateChatMessagePartSchema).min(1).max(32),
})

export const ListChatMessagesQuerySchema = z.object({
  cursor: id.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const ChatThreadResponseSchema = z.object({
  item: ChatThreadSchema,
})

export const ChatThreadListResponseSchema = z.object({
  items: z.array(ChatThreadSchema),
})

export const ChatMessageResponseSchema = z.object({
  item: ChatMessageSchema,
})

export const ChatMessageListResponseSchema = z.object({
  items: z.array(ChatMessageSchema),
  nextCursor: id.optional(),
})

const ChatEventBaseSchema = z.object({
  id,
  threadId: id,
  createdAt: isoDateTime,
  sourceClientId: id.optional(),
})

export const ChatConnectedEventSchema = ChatEventBaseSchema.extend({
  type: z.literal('chat.connected'),
})

export const ChatMessageCreatedEventSchema = ChatEventBaseSchema.extend({
  type: z.literal('chat.message.created'),
  message: ChatMessageSchema,
})

export const ChatMessageUpdatedEventSchema = ChatEventBaseSchema.extend({
  type: z.literal('chat.message.updated'),
  message: ChatMessageSchema,
})

export const ChatMessageDeltaEventSchema = ChatEventBaseSchema.extend({
  type: z.literal('chat.message.delta'),
  delta: z.string(),
  messageId: id,
  sequence: z.number().int().positive(),
  status: ChatMessageStatusSchema.optional(),
  text: z.string().max(20_000),
})

export const ChatErrorEventSchema = ChatEventBaseSchema.extend({
  type: z.literal('chat.error'),
  code: z.string().min(1),
  message: z.string().min(1),
})

export const ChatEventSchema = z.discriminatedUnion('type', [
  ChatConnectedEventSchema,
  ChatMessageDeltaEventSchema,
  ChatMessageCreatedEventSchema,
  ChatMessageUpdatedEventSchema,
  ChatErrorEventSchema,
])

export type ChatEvent = z.infer<typeof ChatEventSchema>
export type ChatAssistantErrorCode = z.infer<typeof ChatAssistantErrorCodeSchema>
export type ChatAssistantRetryState = z.infer<typeof ChatAssistantRetryStateSchema>
export type ChatMessage = z.infer<typeof ChatMessageSchema>
export type ChatMessageParams = z.infer<typeof ChatMessageParamsSchema>
export type ChatMessagePart = z.infer<typeof ChatMessagePartSchema>
export type ChatMessageRole = z.infer<typeof ChatMessageRoleSchema>
export type ChatMessageStatus = z.infer<typeof ChatMessageStatusSchema>
export type ChatThread = z.infer<typeof ChatThreadSchema>
export type ChatThreadStatus = z.infer<typeof ChatThreadStatusSchema>
export type CreateChatMessageInput = z.infer<typeof CreateChatMessageSchema>
export type CreateChatMessagePartInput = z.infer<typeof CreateChatMessagePartSchema>
export type CreateChatThreadInput = z.infer<typeof CreateChatThreadSchema>
export type ListChatMessagesQuery = z.infer<typeof ListChatMessagesQuerySchema>
export type ListChatThreadsQuery = z.infer<typeof ListChatThreadsQuerySchema>
export type ChatThreadResponse = z.infer<typeof ChatThreadResponseSchema>
export type ChatThreadListResponse = z.infer<typeof ChatThreadListResponseSchema>
export type ChatMessageResponse = z.infer<typeof ChatMessageResponseSchema>
export type ChatMessageListResponse = z.infer<typeof ChatMessageListResponseSchema>
