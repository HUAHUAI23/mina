import { and, asc, desc, eq, inArray, isNull, lt, lte, or, sql, type SQL } from 'drizzle-orm'
import type { ChatMessage } from '@mina/contracts/modules/chat'

import type { MinaDbClient } from '../../db/client'
import {
  chatAssistantRuns,
  chatMessageAttachments,
  chatMessageParts,
  chatMessages,
  chatThreads,
} from '../../db/schema'
import { chatAssistantRunFromRow, chatMessageFromRows, chatThreadFromRow } from './chat-mappers'
import type {
  ChatAssistantRun,
  ChatRepository,
  ClaimNextChatAssistantRunInput,
  CreateChatMessageRecordInput,
  CreateChatMessageWithAssistantRunInput,
  CreateChatMessageWithAssistantRunResult,
  CreateChatThreadRecordInput,
  CompleteChatAssistantRunInput,
  ListChatAssistantContextInput,
  ListChatMessagesInput,
  ListChatMessagesResult,
  ListPendingChatAssistantRunThreadsInput,
  RequeueStaleChatAssistantRunsInput,
  RetryAssistantMessageInput,
  RetryChatAssistantRunInput,
  UpdateChatMessageRecordInput,
} from './chat.repository'

type ChatMessageRow = typeof chatMessages.$inferSelect
type ChatMessagePartRow = typeof chatMessageParts.$inferSelect

const toDate = (value: string): Date => new Date(value)
const isUniqueViolation = (error: unknown): boolean =>
  Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505')

export class DrizzleChatRepository implements ChatRepository {
  constructor(private readonly db: MinaDbClient) {}

  async createThread(input: CreateChatThreadRecordInput) {
    if (input.workflowId) {
      const existing = await this.findActiveThreadByWorkflow(input.accountId, input.workflowId)
      if (existing) {
        return existing
      }
    }
    const timestamp = toDate(input.timestamp)
    try {
      const [row] = await this.db.insert(chatThreads).values({
        accountId: input.accountId,
        createdAt: timestamp,
        id: input.id,
        ...(input.title ? { title: input.title } : {}),
        ...(input.workflowId ? { workflowId: input.workflowId } : {}),
        status: 'active',
        updatedAt: timestamp,
      }).returning()
      if (!row) {
        throw new Error('Failed to create chat thread.')
      }
      return chatThreadFromRow(row)
    } catch (error) {
      if (!input.workflowId || !isUniqueViolation(error)) {
        throw error
      }
      const existing = await this.findActiveThreadByWorkflow(input.accountId, input.workflowId)
      if (!existing) {
        throw error
      }
      return existing
    }
  }

  async createMessage(input: CreateChatMessageRecordInput) {
    const timestamp = toDate(input.timestamp)
    return this.db.transaction(async (tx) => {
      await tx.select({ id: chatThreads.id })
        .from(chatThreads)
        .where(eq(chatThreads.id, input.threadId))
        .limit(1)
        .for('update')

      const [latest] = await tx.select({ orderIndex: chatMessages.orderIndex })
        .from(chatMessages)
        .where(eq(chatMessages.threadId, input.threadId))
        .orderBy(desc(chatMessages.orderIndex))
        .limit(1)
      const orderIndex = (latest?.orderIndex ?? -1) + 1
      const [message] = await tx.insert(chatMessages).values({
        accountId: input.accountId,
        ...(input.clientMessageId ? { clientMessageId: input.clientMessageId } : {}),
        createdAt: timestamp,
        id: input.id,
        orderIndex,
        role: input.role ?? 'user',
        status: input.status ?? 'sent',
        threadId: input.threadId,
        updatedAt: timestamp,
      }).returning()
      if (!message) {
        throw new Error('Failed to create chat message.')
      }

      const partInputs = input.parts.map((part, index) => ({
        content: part,
        id: `chat_part_${crypto.randomUUID()}`,
        messageId: input.id,
        orderIndex: index,
        type: part.type,
      }))
      const parts = await tx.insert(chatMessageParts).values(partInputs).returning()

      const attachments = parts.flatMap((part, index) => {
        const content = input.parts[index]
        return content?.type === 'image' || content?.type === 'file'
          ? [{
              id: `chat_attachment_${crypto.randomUUID()}`,
              mediaObjectId: content.mediaObjectId,
              messageId: input.id,
              partId: part.id,
            }]
          : []
      })
      if (attachments.length > 0) {
        await tx.insert(chatMessageAttachments).values(attachments)
      }

      await tx.update(chatThreads)
        .set({ lastMessageAt: timestamp, updatedAt: timestamp })
        .where(eq(chatThreads.id, input.threadId))

      return chatMessageFromRows(message, parts)
    })
  }

  async createMessageWithAssistantRun(
    input: CreateChatMessageWithAssistantRunInput,
  ): Promise<CreateChatMessageWithAssistantRunResult> {
    const timestamp = toDate(input.timestamp)
    return this.db.transaction(async (tx) => {
      await tx.select({ id: chatThreads.id })
        .from(chatThreads)
        .where(eq(chatThreads.id, input.threadId))
        .limit(1)
        .for('update')

      const [latest] = await tx.select({ orderIndex: chatMessages.orderIndex })
        .from(chatMessages)
        .where(eq(chatMessages.threadId, input.threadId))
        .orderBy(desc(chatMessages.orderIndex))
        .limit(1)
      const userOrderIndex = (latest?.orderIndex ?? -1) + 1
      const assistantOrderIndex = userOrderIndex + 1

      const [userMessage] = await tx.insert(chatMessages).values({
        accountId: input.accountId,
        ...(input.clientMessageId ? { clientMessageId: input.clientMessageId } : {}),
        createdAt: timestamp,
        id: input.userMessageId,
        orderIndex: userOrderIndex,
        role: 'user',
        status: 'sent',
        threadId: input.threadId,
        updatedAt: timestamp,
      }).returning()
      if (!userMessage) {
        throw new Error('Failed to create chat message.')
      }
      const userParts = await tx.insert(chatMessageParts).values(input.parts.map((part, index) => ({
        content: part,
        id: `chat_part_${crypto.randomUUID()}`,
        messageId: input.userMessageId,
        orderIndex: index,
        type: part.type,
      }))).returning()

      const userAttachments = userParts.flatMap((part, index) => {
        const content = input.parts[index]
        return content?.type === 'image' || content?.type === 'file'
          ? [{
              id: `chat_attachment_${crypto.randomUUID()}`,
              mediaObjectId: content.mediaObjectId,
              messageId: input.userMessageId,
              partId: part.id,
            }]
          : []
      })
      if (userAttachments.length > 0) {
        await tx.insert(chatMessageAttachments).values(userAttachments)
      }

      const assistantPartsInput = [{ type: 'text' as const, text: '' }]
      const [assistantMessage] = await tx.insert(chatMessages).values({
        accountId: input.accountId,
        createdAt: timestamp,
        id: input.assistantMessageId,
        orderIndex: assistantOrderIndex,
        role: 'assistant',
        status: 'streaming',
        threadId: input.threadId,
        updatedAt: timestamp,
      }).returning()
      if (!assistantMessage) {
        throw new Error('Failed to create assistant message.')
      }
      const assistantParts = await tx.insert(chatMessageParts).values(assistantPartsInput.map((part, index) => ({
        content: part,
        id: `chat_part_${crypto.randomUUID()}`,
        messageId: input.assistantMessageId,
        orderIndex: index,
        type: part.type,
      }))).returning()

      const [assistantRun] = await tx.insert(chatAssistantRuns).values({
        accountId: input.accountId,
        assistantMessageId: input.assistantMessageId,
        attemptCount: 0,
        createdAt: timestamp,
        id: input.assistantRunId,
        maxAttempts: input.maxAttempts,
        status: 'queued',
        threadId: input.threadId,
        updatedAt: timestamp,
        userMessageId: input.userMessageId,
      }).returning()
      if (!assistantRun) {
        throw new Error('Failed to create assistant run.')
      }

      await tx.update(chatThreads)
        .set({ lastMessageAt: timestamp, updatedAt: timestamp })
        .where(eq(chatThreads.id, input.threadId))

      return {
        assistantMessage: chatMessageFromRows(assistantMessage, assistantParts),
        assistantRun: chatAssistantRunFromRow(assistantRun),
        userMessage: chatMessageFromRows(userMessage, userParts),
      }
    })
  }

  async claimNextAssistantRun(input: ClaimNextChatAssistantRunInput): Promise<ChatAssistantRun | undefined> {
    const timestamp = toDate(input.timestamp)
    const [claimed] = await this.db.transaction(async (tx) => {
      const [thread] = await tx.select({ id: chatThreads.id })
        .from(chatThreads)
        .where(eq(chatThreads.id, input.threadId))
        .limit(1)
        .for('update')
      if (!thread) {
        return []
      }

      const [running] = await tx.select({ id: chatAssistantRuns.id })
        .from(chatAssistantRuns)
        .where(and(eq(chatAssistantRuns.threadId, input.threadId), eq(chatAssistantRuns.status, 'running' as const)))
        .limit(1)
      if (running) {
        return []
      }

      const [queued] = await tx.select()
        .from(chatAssistantRuns)
        .where(and(
          eq(chatAssistantRuns.threadId, input.threadId),
          eq(chatAssistantRuns.status, 'queued' as const),
          or(isNull(chatAssistantRuns.nextRetryAt), lte(chatAssistantRuns.nextRetryAt, timestamp)),
        ))
        .orderBy(asc(chatAssistantRuns.createdAt), asc(chatAssistantRuns.id))
        .limit(1)
        .for('update', { skipLocked: true })
      if (!queued) {
        return []
      }

      return tx.update(chatAssistantRuns)
        .set({
          attemptCount: sql`${chatAssistantRuns.attemptCount} + 1`,
          errorCode: null,
          errorDebugMessage: null,
          errorMessageKey: null,
          errorParams: null,
          finishedAt: null,
          nextRetryAt: null,
          startedAt: timestamp,
          status: 'running',
          updatedAt: timestamp,
        })
        .where(eq(chatAssistantRuns.id, queued.id))
        .returning()
    })

    return claimed ? chatAssistantRunFromRow(claimed) : undefined
  }

  async completeAssistantRun(input: CompleteChatAssistantRunInput): Promise<ChatAssistantRun> {
    const timestamp = toDate(input.timestamp)
    const [row] = await this.db.update(chatAssistantRuns)
      .set({
        errorCode: input.errorCode ?? null,
        errorDebugMessage: input.errorDebugMessage ?? null,
        errorMessageKey: input.errorMessageKey ?? null,
        errorParams: input.errorParams ?? null,
        finishedAt: timestamp,
        nextRetryAt: null,
        status: input.status,
        updatedAt: timestamp,
      })
      .where(and(eq(chatAssistantRuns.id, input.id), eq(chatAssistantRuns.threadId, input.threadId)))
      .returning()
    if (!row) {
      throw new Error('Failed to complete assistant run.')
    }
    return chatAssistantRunFromRow(row)
  }

  async findMessageByClientId(threadId: string, clientMessageId: string) {
    const [message] = await this.db.select()
      .from(chatMessages)
      .where(and(eq(chatMessages.threadId, threadId), eq(chatMessages.clientMessageId, clientMessageId)))
      .limit(1)
    if (!message) {
      return undefined
    }
    const parts = await this.partsForMessages([message.id])
    return chatMessageFromRows(message, parts.get(message.id) ?? [])
  }

  async findActiveThreadByWorkflow(accountId: string, workflowId: string) {
    const [row] = await this.db.select()
      .from(chatThreads)
      .where(and(
        eq(chatThreads.accountId, accountId),
        eq(chatThreads.workflowId, workflowId),
        eq(chatThreads.status, 'active' as const),
      ))
      .orderBy(desc(chatThreads.updatedAt))
      .limit(1)
    return row ? chatThreadFromRow(row) : undefined
  }

  async findThreadById(accountId: string, threadId: string) {
    const [row] = await this.db.select()
      .from(chatThreads)
      .where(and(eq(chatThreads.accountId, accountId), eq(chatThreads.id, threadId)))
      .limit(1)
    return row ? chatThreadFromRow(row) : undefined
  }

  async listMessages(input: ListChatMessagesInput): Promise<ListChatMessagesResult> {
    const conditions: SQL[] = [eq(chatMessages.threadId, input.threadId)]
    if (input.cursor) {
      const cursorMessage = await this.findMessageRow(input.threadId, input.cursor)
      if (cursorMessage) {
        conditions.push(lt(chatMessages.orderIndex, cursorMessage.orderIndex))
      }
    }
    const rows = await this.db.select()
      .from(chatMessages)
      .where(and(...conditions))
      .orderBy(desc(chatMessages.orderIndex))
      .limit(input.limit + 1)

    const page = rows.slice(0, input.limit)
    const parts = await this.partsForMessages(page.map((message) => message.id))
    const items = page
      .map((message) => chatMessageFromRows(message, parts.get(message.id) ?? []))
      .reverse()
    const nextCursor = rows.length > input.limit ? page.at(0)?.id : undefined
    return {
      items,
      ...(nextCursor ? { nextCursor } : {}),
    }
  }

  async listPendingAssistantRunThreadIds(input: ListPendingChatAssistantRunThreadsInput): Promise<string[]> {
    const timestamp = toDate(input.timestamp)
    const rows = await this.db.selectDistinctOn([chatAssistantRuns.threadId], {
      threadId: chatAssistantRuns.threadId,
    })
      .from(chatAssistantRuns)
      .where(and(
        eq(chatAssistantRuns.status, 'queued' as const),
        or(isNull(chatAssistantRuns.nextRetryAt), lte(chatAssistantRuns.nextRetryAt, timestamp)),
      ))
      .orderBy(asc(chatAssistantRuns.threadId), asc(chatAssistantRuns.createdAt), asc(chatAssistantRuns.id))
      .limit(input.limit)

    return rows.map((row) => row.threadId)
  }

  async listAssistantContext(input: ListChatAssistantContextInput): Promise<ChatMessage[]> {
    const boundary = await this.findMessageRow(input.threadId, input.assistantMessageId)
    if (!boundary) {
      return []
    }
    const rows = await this.db.select()
      .from(chatMessages)
      .where(and(
        eq(chatMessages.threadId, input.threadId),
        lt(chatMessages.orderIndex, boundary.orderIndex),
      ))
      .orderBy(desc(chatMessages.orderIndex))
      .limit(input.limit)
    const parts = await this.partsForMessages(rows.map((message) => message.id))
    return rows
      .map((message) => chatMessageFromRows(message, parts.get(message.id) ?? []))
      .reverse()
  }

  async listThreads(accountId: string, workflowId?: string) {
    const conditions = [
      eq(chatThreads.accountId, accountId),
      eq(chatThreads.status, 'active' as const),
      ...(workflowId ? [eq(chatThreads.workflowId, workflowId)] : []),
    ]
    const rows = await this.db.select()
      .from(chatThreads)
      .where(and(...conditions))
      .orderBy(desc(chatThreads.updatedAt))
    return rows.map(chatThreadFromRow)
  }

  async requeueStaleAssistantRuns(input: RequeueStaleChatAssistantRunsInput): Promise<string[]> {
    const timestamp = toDate(input.timestamp)
    const rows = await this.db.update(chatAssistantRuns)
      .set({
        nextRetryAt: null,
        startedAt: null,
        status: 'queued',
        updatedAt: timestamp,
      })
      .where(and(
        eq(chatAssistantRuns.status, 'running' as const),
        lt(chatAssistantRuns.startedAt, toDate(input.staleBefore)),
      ))
      .returning({ threadId: chatAssistantRuns.threadId })
    return [...new Set(rows.map((row) => row.threadId))]
  }

  async retryAssistantRun(input: RetryChatAssistantRunInput): Promise<ChatAssistantRun> {
    const timestamp = toDate(input.timestamp)
    const [row] = await this.db.update(chatAssistantRuns)
      .set({
        errorCode: input.errorCode ?? null,
        errorDebugMessage: input.errorDebugMessage ?? null,
        errorMessageKey: input.errorMessageKey ?? null,
        errorParams: input.errorParams ?? null,
        finishedAt: null,
        nextRetryAt: toDate(input.nextRetryAt),
        startedAt: null,
        status: 'queued',
        updatedAt: timestamp,
      })
      .where(and(
        eq(chatAssistantRuns.id, input.id),
        eq(chatAssistantRuns.threadId, input.threadId),
        eq(chatAssistantRuns.status, 'running' as const),
      ))
      .returning()
    if (!row) {
      throw new Error('Failed to retry assistant run.')
    }
    return chatAssistantRunFromRow(row)
  }

  async retryAssistantMessage(
    input: RetryAssistantMessageInput,
  ): Promise<{ message: ChatMessage; run: ChatAssistantRun } | undefined> {
    const timestamp = toDate(input.timestamp)
    return this.db.transaction(async (tx) => {
      const [message] = await tx.select()
        .from(chatMessages)
        .where(and(eq(chatMessages.id, input.messageId), eq(chatMessages.threadId, input.threadId)))
        .limit(1)
        .for('update')
      if (!message || message.role !== 'assistant' || message.status !== 'failed') {
        return undefined
      }

      const existingParts = await tx.select()
        .from(chatMessageParts)
        .where(eq(chatMessageParts.messageId, input.messageId))
        .orderBy(asc(chatMessageParts.orderIndex))
      const retryable = existingParts.some((part) => {
        const content = part.content
        return content.type === 'error' && content.retryable === true
      })
      if (!retryable) {
        return undefined
      }

      const [run] = await tx.select()
        .from(chatAssistantRuns)
        .where(and(
          eq(chatAssistantRuns.assistantMessageId, input.messageId),
          eq(chatAssistantRuns.threadId, input.threadId),
          eq(chatAssistantRuns.status, 'failed' as const),
        ))
        .orderBy(desc(chatAssistantRuns.updatedAt), desc(chatAssistantRuns.id))
        .limit(1)
        .for('update')
      if (!run) {
        return undefined
      }

      await tx.delete(chatMessageAttachments)
        .where(eq(chatMessageAttachments.messageId, input.messageId))
      await tx.delete(chatMessageParts)
        .where(eq(chatMessageParts.messageId, input.messageId))

      const retryPartsInput = [{ type: 'text' as const, text: '' }]
      const [updatedMessage] = await tx.update(chatMessages)
        .set({
          status: 'streaming',
          updatedAt: timestamp,
        })
        .where(and(eq(chatMessages.id, input.messageId), eq(chatMessages.threadId, input.threadId)))
        .returning()
      if (!updatedMessage) {
        throw new Error('Failed to retry assistant message.')
      }
      const retryParts = await tx.insert(chatMessageParts).values(retryPartsInput.map((part, index) => ({
        content: part,
        id: `chat_part_${crypto.randomUUID()}`,
        messageId: input.messageId,
        orderIndex: index,
        type: part.type,
      }))).returning()

      const [updatedRun] = await tx.update(chatAssistantRuns)
        .set({
          attemptCount: 0,
          errorCode: null,
          errorDebugMessage: null,
          errorMessageKey: null,
          errorParams: null,
          finishedAt: null,
          nextRetryAt: null,
          startedAt: null,
          status: 'queued',
          updatedAt: timestamp,
        })
        .where(eq(chatAssistantRuns.id, run.id))
        .returning()
      if (!updatedRun) {
        throw new Error('Failed to retry assistant run.')
      }

      await tx.update(chatThreads)
        .set({ lastMessageAt: timestamp, updatedAt: timestamp })
        .where(eq(chatThreads.id, input.threadId))

      return {
        message: chatMessageFromRows(updatedMessage, retryParts),
        run: chatAssistantRunFromRow(updatedRun),
      }
    })
  }

  async updateMessage(input: UpdateChatMessageRecordInput): Promise<ChatMessage> {
    const timestamp = toDate(input.timestamp)
    return this.db.transaction(async (tx) => {
      await tx.delete(chatMessageAttachments)
        .where(eq(chatMessageAttachments.messageId, input.id))
      await tx.delete(chatMessageParts)
        .where(eq(chatMessageParts.messageId, input.id))

      const [message] = await tx.update(chatMessages)
        .set({
          status: input.status,
          updatedAt: timestamp,
        })
        .where(and(eq(chatMessages.id, input.id), eq(chatMessages.threadId, input.threadId)))
        .returning()
      if (!message) {
        throw new Error('Failed to update chat message.')
      }

      const partInputs = input.parts.map((part, index) => ({
        content: part,
        id: `chat_part_${crypto.randomUUID()}`,
        messageId: input.id,
        orderIndex: index,
        type: part.type,
      }))
      const parts = await tx.insert(chatMessageParts).values(partInputs).returning()

      const attachments = parts.flatMap((part, index) => {
        const content = input.parts[index]
        return content?.type === 'image' || content?.type === 'file'
          ? [{
              id: `chat_attachment_${crypto.randomUUID()}`,
              mediaObjectId: content.mediaObjectId,
              messageId: input.id,
              partId: part.id,
            }]
          : []
      })
      if (attachments.length > 0) {
        await tx.insert(chatMessageAttachments).values(attachments)
      }

      await tx.update(chatThreads)
        .set({ lastMessageAt: timestamp, updatedAt: timestamp })
        .where(eq(chatThreads.id, input.threadId))

      return chatMessageFromRows(message, parts)
    })
  }

  private async findMessageRow(threadId: string, messageId: string): Promise<ChatMessageRow | undefined> {
    const [message] = await this.db.select()
      .from(chatMessages)
      .where(and(eq(chatMessages.threadId, threadId), eq(chatMessages.id, messageId)))
      .limit(1)
    return message
  }

  private async partsForMessages(messageIds: string[]): Promise<Map<string, ChatMessagePartRow[]>> {
    if (messageIds.length === 0) {
      return new Map()
    }
    const rows = await this.db.select()
      .from(chatMessageParts)
      .where(inArray(chatMessageParts.messageId, messageIds))
      .orderBy(asc(chatMessageParts.messageId), asc(chatMessageParts.orderIndex))
    const grouped = new Map<string, ChatMessagePartRow[]>()
    for (const row of rows) {
      const current = grouped.get(row.messageId) ?? []
      current.push(row)
      grouped.set(row.messageId, current)
    }
    return grouped
  }
}
