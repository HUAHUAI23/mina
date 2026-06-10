import {
  ChatMessageSchema,
  ChatAssistantErrorCodeSchema,
  ChatThreadSchema,
  type ChatMessage,
  type ChatMessagePart,
  type ChatThread,
} from '@mina/contracts/modules/chat'

import type { chatMessages, chatMessageParts, chatThreads } from '../../db/schema'
import type { chatAssistantRuns } from '../../db/schema'
import type { ChatAssistantRun } from './chat.repository'

type ChatThreadRow = typeof chatThreads.$inferSelect
type ChatMessageRow = typeof chatMessages.$inferSelect
type ChatMessagePartRow = typeof chatMessageParts.$inferSelect
type ChatAssistantRunRow = typeof chatAssistantRuns.$inferSelect

export const toIso = (value: Date): string => value.toISOString()

export const chatThreadFromRow = (row: ChatThreadRow): ChatThread =>
  ChatThreadSchema.parse({
    id: row.id,
    accountId: row.accountId,
    ...(row.workflowId ? { workflowId: row.workflowId } : {}),
    ...(row.title ? { title: row.title } : {}),
    status: row.status,
    ...(row.lastMessageAt ? { lastMessageAt: toIso(row.lastMessageAt) } : {}),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  })

export const chatMessageFromRows = (message: ChatMessageRow, parts: ChatMessagePartRow[]): ChatMessage =>
  ChatMessageSchema.parse({
    id: message.id,
    threadId: message.threadId,
    accountId: message.accountId,
    role: message.role,
    status: message.status,
    orderIndex: message.orderIndex,
    ...(message.clientMessageId ? { clientMessageId: message.clientMessageId } : {}),
    parts: parts
      .sort((left, right) => left.orderIndex - right.orderIndex)
      .map((part) => part.content satisfies ChatMessagePart),
    createdAt: toIso(message.createdAt),
    updatedAt: toIso(message.updatedAt),
  })

export const chatAssistantRunFromRow = (row: ChatAssistantRunRow): ChatAssistantRun => ({
  accountId: row.accountId,
  assistantMessageId: row.assistantMessageId,
  attemptCount: row.attemptCount,
  createdAt: toIso(row.createdAt),
  ...(row.errorCode ? { errorCode: ChatAssistantErrorCodeSchema.parse(row.errorCode) } : {}),
  ...(row.errorDebugMessage ? { errorDebugMessage: row.errorDebugMessage } : {}),
  ...(row.errorMessageKey ? { errorMessageKey: row.errorMessageKey } : {}),
  ...(row.errorParams ? { errorParams: row.errorParams } : {}),
  ...(row.finishedAt ? { finishedAt: toIso(row.finishedAt) } : {}),
  id: row.id,
  maxAttempts: row.maxAttempts,
  ...(row.nextRetryAt ? { nextRetryAt: toIso(row.nextRetryAt) } : {}),
  ...(row.startedAt ? { startedAt: toIso(row.startedAt) } : {}),
  status: row.status,
  threadId: row.threadId,
  updatedAt: toIso(row.updatedAt),
  userMessageId: row.userMessageId,
})
