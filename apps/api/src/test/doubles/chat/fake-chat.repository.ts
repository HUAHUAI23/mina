
import type { ChatMessage, ChatThread } from '@mina/contracts/modules/chat'

import type {
  ChatAssistantRun,
  ChatRepository,
  ClaimNextChatAssistantRunInput,
  CompleteChatAssistantRunInput,
  CreateChatMessageRecordInput,
  CreateChatMessageWithAssistantRunInput,
  CreateChatMessageWithAssistantRunResult,
  CreateChatThreadRecordInput,
  ListChatAssistantContextInput,
  ListChatMessagesInput,
  ListChatMessagesResult,
  ListPendingChatAssistantRunThreadsInput,
  RequeueStaleChatAssistantRunsInput,
  RetryAssistantMessageInput,
  RetryChatAssistantRunInput,
} from '../../../modules/chat/chat.repository'
import { clone } from '../shared/clone'

export class FakeChatRepository implements ChatRepository {
  readonly #messages = new Map<string, ChatMessage>()
  readonly #runs = new Map<string, ChatAssistantRun>()
  readonly #threads = new Map<string, ChatThread>()

  async createThread(input: CreateChatThreadRecordInput): Promise<ChatThread> {
    const thread: ChatThread = {
      accountId: input.accountId,
      createdAt: input.timestamp,
      id: input.id,
      ...(input.title ? { title: input.title } : {}),
      status: 'active',
      updatedAt: input.timestamp,
      ...(input.workflowId ? { workflowId: input.workflowId } : {}),
    }
    this.#threads.set(thread.id, thread)
    return clone(thread)
  }

  async createMessage(input: CreateChatMessageRecordInput): Promise<ChatMessage> {
    const message: ChatMessage = {
      accountId: input.accountId,
      ...(input.clientMessageId ? { clientMessageId: input.clientMessageId } : {}),
      createdAt: input.timestamp,
      id: input.id,
      orderIndex: this.nextMessageOrderIndex(input.threadId),
      parts: clone(input.parts),
      role: input.role ?? 'user',
      status: input.status ?? 'sent',
      threadId: input.threadId,
      updatedAt: input.timestamp,
    }
    this.#messages.set(message.id, message)
    const thread = this.#threads.get(input.threadId)
    if (thread) {
      this.#threads.set(thread.id, {
        ...thread,
        lastMessageAt: input.timestamp,
        updatedAt: input.timestamp,
      })
    }
    return this.cloneMessage(message)
  }

  async createMessageWithAssistantRun(
    input: CreateChatMessageWithAssistantRunInput,
  ): Promise<CreateChatMessageWithAssistantRunResult> {
    const userOrderIndex = this.nextMessageOrderIndex(input.threadId)
    const assistantOrderIndex = userOrderIndex + 1
    const userMessage: ChatMessage = {
      accountId: input.accountId,
      ...(input.clientMessageId ? { clientMessageId: input.clientMessageId } : {}),
      createdAt: input.timestamp,
      id: input.userMessageId,
      orderIndex: userOrderIndex,
      parts: clone(input.parts),
      role: 'user',
      status: 'sent',
      threadId: input.threadId,
      updatedAt: input.timestamp,
    }
    const assistantMessage: ChatMessage = {
      accountId: input.accountId,
      createdAt: input.timestamp,
      id: input.assistantMessageId,
      orderIndex: assistantOrderIndex,
      parts: [{ type: 'text', text: '' }],
      role: 'assistant',
      status: 'streaming',
      threadId: input.threadId,
      updatedAt: input.timestamp,
    }
    const assistantRun: ChatAssistantRun = {
      accountId: input.accountId,
      assistantMessageId: input.assistantMessageId,
      attemptCount: 0,
      createdAt: input.timestamp,
      id: input.assistantRunId,
      maxAttempts: input.maxAttempts,
      status: 'queued',
      threadId: input.threadId,
      updatedAt: input.timestamp,
      userMessageId: input.userMessageId,
    }
    this.#messages.set(userMessage.id, userMessage)
    this.#messages.set(assistantMessage.id, assistantMessage)
    this.#runs.set(assistantRun.id, assistantRun)
    const thread = this.#threads.get(input.threadId)
    if (thread) {
      this.#threads.set(thread.id, {
        ...thread,
        lastMessageAt: input.timestamp,
        updatedAt: input.timestamp,
      })
    }
    return {
      assistantMessage: this.cloneMessage(assistantMessage),
      assistantRun: clone(assistantRun),
      userMessage: this.cloneMessage(userMessage),
    }
  }

  async claimNextAssistantRun(input: ClaimNextChatAssistantRunInput): Promise<ChatAssistantRun | undefined> {
    const running = [...this.#runs.values()].find(
      (run) => run.threadId === input.threadId && run.status === 'running',
    )
    if (running) {
      return undefined
    }
    const queued = [...this.#runs.values()]
      .filter((run) =>
        run.threadId === input.threadId &&
        run.status === 'queued' &&
        (!run.nextRetryAt || new Date(run.nextRetryAt) <= new Date(input.timestamp))
      )
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))[0]
    if (!queued) {
      return undefined
    }
    const claimed: ChatAssistantRun = {
      ...queued,
      attemptCount: queued.attemptCount + 1,
      startedAt: input.timestamp,
      status: 'running',
      updatedAt: input.timestamp,
    }
    this.clearRunTransientFields(claimed)
    this.#runs.set(claimed.id, claimed)
    return clone(claimed)
  }

  async completeAssistantRun(input: CompleteChatAssistantRunInput): Promise<ChatAssistantRun> {
    const existing = this.#runs.get(input.id)
    if (!existing || existing.threadId !== input.threadId) {
      throw new Error('Failed to complete assistant run.')
    }
    const updated: ChatAssistantRun = {
      ...existing,
      finishedAt: input.timestamp,
      status: input.status,
      updatedAt: input.timestamp,
    }
    this.clearRunErrorFields(updated)
    if (input.errorCode) {
      updated.errorCode = input.errorCode
    }
    if (input.errorDebugMessage) {
      updated.errorDebugMessage = input.errorDebugMessage
    }
    if (input.errorMessageKey) {
      updated.errorMessageKey = input.errorMessageKey
    }
    if (input.errorParams) {
      updated.errorParams = input.errorParams
    }
    this.#runs.set(updated.id, updated)
    return clone(updated)
  }

  async updateMessage(input: {
    id: string
    parts: ChatMessage['parts']
    status: ChatMessage['status']
    threadId: string
    timestamp: string
  }): Promise<ChatMessage> {
    const existing = this.#messages.get(input.id)
    if (!existing || existing.threadId !== input.threadId) {
      throw new Error('Failed to update chat message.')
    }
    const updated: ChatMessage = {
      ...existing,
      parts: clone(input.parts),
      status: input.status,
      updatedAt: input.timestamp,
    }
    this.#messages.set(updated.id, updated)
    const thread = this.#threads.get(input.threadId)
    if (thread) {
      this.#threads.set(thread.id, {
        ...thread,
        lastMessageAt: input.timestamp,
        updatedAt: input.timestamp,
      })
    }
    return this.cloneMessage(updated)
  }

  async findMessageByClientId(threadId: string, clientMessageId: string): Promise<ChatMessage | undefined> {
    const message = [...this.#messages.values()].find(
      (item) => item.threadId === threadId && item.clientMessageId === clientMessageId,
    )
    return message ? this.cloneMessage(message) : undefined
  }

  async findActiveThreadByWorkflow(accountId: string, workflowId: string): Promise<ChatThread | undefined> {
    const thread = [...this.#threads.values()]
      .filter((item) => item.accountId === accountId && item.workflowId === workflowId && item.status === 'active')
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
    return thread ? clone(thread) : undefined
  }

  async findThreadById(accountId: string, threadId: string): Promise<ChatThread | undefined> {
    const thread = this.#threads.get(threadId)
    return thread?.accountId === accountId ? clone(thread) : undefined
  }

  async listMessages(input: ListChatMessagesInput): Promise<ListChatMessagesResult> {
    const all = [...this.#messages.values()]
      .filter((message) => message.threadId === input.threadId)
      .sort((left, right) => left.orderIndex - right.orderIndex)
    const cursor = input.cursor ? all.find((message) => message.id === input.cursor) : undefined
    const eligible = cursor
      ? all.filter((message) => message.orderIndex < cursor.orderIndex)
      : all
    const items = eligible.slice(Math.max(0, eligible.length - input.limit))
    return {
      items: items.map((message) => this.cloneMessage(message)),
      ...(eligible.length > items.length && items[0] ? { nextCursor: items[0].id } : {}),
    }
  }

  async listPendingAssistantRunThreadIds(input: ListPendingChatAssistantRunThreadsInput): Promise<string[]> {
    const seen = new Set<string>()
    const threadIds: string[] = []
    for (const run of [...this.#runs.values()]
      .filter((item) =>
        item.status === 'queued' &&
        (!item.nextRetryAt || new Date(item.nextRetryAt) <= new Date(input.timestamp))
      )
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))) {
      if (seen.has(run.threadId)) {
        continue
      }
      seen.add(run.threadId)
      threadIds.push(run.threadId)
      if (threadIds.length >= input.limit) {
        break
      }
    }
    return threadIds
  }

  async listAssistantContext(input: ListChatAssistantContextInput): Promise<ChatMessage[]> {
    const boundary = this.#messages.get(input.assistantMessageId)
    if (!boundary || boundary.threadId !== input.threadId) {
      return []
    }
    return [...this.#messages.values()]
      .filter((message) => message.threadId === input.threadId && message.orderIndex < boundary.orderIndex)
      .sort((left, right) => left.orderIndex - right.orderIndex)
      .slice(-input.limit)
      .map((message) => this.cloneMessage(message))
  }

  async listThreads(accountId: string, workflowId?: string): Promise<ChatThread[]> {
    return [...this.#threads.values()]
      .filter((thread) => thread.accountId === accountId && thread.status === 'active')
      .filter((thread) => !workflowId || thread.workflowId === workflowId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(clone)
  }

  async requeueStaleAssistantRuns(input: RequeueStaleChatAssistantRunsInput): Promise<string[]> {
    const staleBefore = new Date(input.staleBefore).getTime()
    const threadIds = new Set<string>()
    for (const run of this.#runs.values()) {
      if (run.status !== 'running' || !run.startedAt || new Date(run.startedAt).getTime() >= staleBefore) {
        continue
      }
      const queuedRun = { ...run }
      delete queuedRun.startedAt
      delete queuedRun.nextRetryAt
      this.#runs.set(run.id, {
        ...queuedRun,
        status: 'queued',
        updatedAt: input.timestamp,
      })
      threadIds.add(run.threadId)
    }
    return [...threadIds]
  }

  async retryAssistantRun(input: RetryChatAssistantRunInput): Promise<ChatAssistantRun> {
    const existing = this.#runs.get(input.id)
    if (!existing || existing.threadId !== input.threadId || existing.status !== 'running') {
      throw new Error('Failed to retry assistant run.')
    }
    const updated: ChatAssistantRun = {
      ...existing,
      nextRetryAt: input.nextRetryAt,
      status: 'queued',
      updatedAt: input.timestamp,
    }
    this.clearRunErrorFields(updated)
    delete updated.finishedAt
    delete updated.startedAt
    if (input.errorCode) {
      updated.errorCode = input.errorCode
    }
    if (input.errorDebugMessage) {
      updated.errorDebugMessage = input.errorDebugMessage
    }
    if (input.errorMessageKey) {
      updated.errorMessageKey = input.errorMessageKey
    }
    if (input.errorParams) {
      updated.errorParams = input.errorParams
    }
    this.#runs.set(updated.id, updated)
    return clone(updated)
  }

  async retryAssistantMessage(
    input: RetryAssistantMessageInput,
  ): Promise<{ message: ChatMessage; run: ChatAssistantRun } | undefined> {
    const message = this.#messages.get(input.messageId)
    if (!message || message.threadId !== input.threadId || message.role !== 'assistant' || message.status !== 'failed') {
      return undefined
    }
    const retryable = message.parts.some((part) => part.type === 'error' && part.retryable === true)
    if (!retryable) {
      return undefined
    }
    const run = [...this.#runs.values()]
      .filter((item) =>
        item.threadId === input.threadId &&
        item.assistantMessageId === input.messageId &&
        item.status === 'failed'
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id))[0]
    if (!run) {
      return undefined
    }
    const updatedMessage: ChatMessage = {
      ...message,
      parts: [{ type: 'text', text: '' }],
      status: 'streaming',
      updatedAt: input.timestamp,
    }
    const updatedRun: ChatAssistantRun = {
      ...run,
      attemptCount: 0,
      status: 'queued',
      updatedAt: input.timestamp,
    }
    this.clearRunTransientFields(updatedRun)
    this.#messages.set(updatedMessage.id, updatedMessage)
    this.#runs.set(updatedRun.id, updatedRun)
    const thread = this.#threads.get(input.threadId)
    if (thread) {
      this.#threads.set(thread.id, {
        ...thread,
        lastMessageAt: input.timestamp,
        updatedAt: input.timestamp,
      })
    }
    return {
      message: this.cloneMessage(updatedMessage),
      run: clone(updatedRun),
    }
  }

  private nextMessageOrderIndex(threadId: string): number {
    const latest = [...this.#messages.values()]
      .filter((message) => message.threadId === threadId)
      .sort((left, right) => right.orderIndex - left.orderIndex)[0]
    return (latest?.orderIndex ?? -1) + 1
  }

  private cloneMessage(message: ChatMessage): ChatMessage {
    return clone(message)
  }

  private clearRunErrorFields(run: ChatAssistantRun): void {
    delete run.errorCode
    delete run.errorDebugMessage
    delete run.errorMessageKey
    delete run.errorParams
  }

  private clearRunTransientFields(run: ChatAssistantRun): void {
    this.clearRunErrorFields(run)
    delete run.finishedAt
    delete run.nextRetryAt
  }
}
