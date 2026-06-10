import {
  ChatMessagePartSchema,
  type ChatAssistantErrorCode,
  type ChatAssistantRetryState,
  type ChatEvent,
  type ChatMessage,
  type ChatMessagePart,
  type ChatThread,
  type CreateChatMessageInput,
  type CreateChatThreadInput,
  type ListChatMessagesQuery,
} from '@mina/contracts/modules/chat'

import { HttpError } from '../../lib/http/http-error'
import type { MediaObjectService } from '../media/media-object.service'
import type { WorkflowsService } from '../workflows/workflows.service'
import { createChatEventId, type ChatEventPublisher } from './chat-event-bus'
import type { AssistantChatResponder } from './ai-chat.service'
import type { ChatAssistantRun, ChatRepository } from './chat.repository'
import {
  ClassifiedChatAssistantError,
  classifyChatAssistantError,
  toClassification,
  type ChatAssistantErrorClassification,
} from './chat-error-classifier'

const nowIso = (): string => new Date().toISOString()
const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`
const MAX_ASSISTANT_STREAM_TEXT_CHARS = 20_000
const STREAM_DELTA_FLUSH_MS = 50
const STREAM_DELTA_FLUSH_CHARS = 240
const DEFAULT_ASSISTANT_RUN_RECONCILE_LIMIT = 50
const DEFAULT_ASSISTANT_RUN_STALE_MS = 5 * 60 * 1000
const DEFAULT_ASSISTANT_RUN_MAX_ATTEMPTS = 3
const DEFAULT_ASSISTANT_RETRY_BASE_MS = 1_000
const DEFAULT_ASSISTANT_RETRY_MAX_MS = 30_000

export interface ChatServiceOptions {
  assistantRetryBaseMs?: number
  assistantRetryMaxMs?: number
  assistantRunMaxAttempts?: number
  assistantRunReconcileLimit?: number
  assistantRunStaleMs?: number
}

export class ChatService {
  readonly #assistantRunDrains = new Map<string, Promise<void>>()
  readonly #assistantRetryBaseMs: number
  readonly #assistantRetryMaxMs: number
  readonly #assistantRunMaxAttempts: number
  readonly #assistantRunReconcileLimit: number
  readonly #assistantRunStaleMs: number

  constructor(
    private readonly repository: ChatRepository,
    private readonly mediaObjectService: MediaObjectService,
    private readonly workflowsService: WorkflowsService,
    private readonly eventPublisher: ChatEventPublisher,
    private readonly aiChatService?: AssistantChatResponder,
    options: ChatServiceOptions = {},
  ) {
    this.#assistantRunReconcileLimit = options.assistantRunReconcileLimit ?? DEFAULT_ASSISTANT_RUN_RECONCILE_LIMIT
    this.#assistantRunStaleMs = options.assistantRunStaleMs ?? DEFAULT_ASSISTANT_RUN_STALE_MS
    this.#assistantRunMaxAttempts = options.assistantRunMaxAttempts ?? DEFAULT_ASSISTANT_RUN_MAX_ATTEMPTS
    this.#assistantRetryBaseMs = options.assistantRetryBaseMs ?? DEFAULT_ASSISTANT_RETRY_BASE_MS
    this.#assistantRetryMaxMs = options.assistantRetryMaxMs ?? DEFAULT_ASSISTANT_RETRY_MAX_MS
  }

  async createThread(accountId: string, input: CreateChatThreadInput): Promise<ChatThread> {
    if (input.workflowId) {
      await this.workflowsService.getWorkflow(input.workflowId, accountId)
      const existing = await this.repository.findActiveThreadByWorkflow(accountId, input.workflowId)
      if (existing) {
        return existing
      }
    }
    return this.repository.createThread({
      accountId,
      id: createId('chat_thread'),
      ...(input.title ? { title: input.title.trim() } : {}),
      ...(input.workflowId ? { workflowId: input.workflowId } : {}),
      timestamp: nowIso(),
    })
  }

  async listThreads(accountId: string, workflowId?: string): Promise<ChatThread[]> {
    if (workflowId) {
      await this.workflowsService.getWorkflow(workflowId, accountId)
    }
    return this.repository.listThreads(accountId, workflowId)
  }

  async getThread(accountId: string, threadId: string): Promise<ChatThread> {
    const thread = await this.repository.findThreadById(accountId, threadId)
    if (!thread) {
      throw this.threadNotFound()
    }
    return thread
  }

  async listMessages(
    accountId: string,
    threadId: string,
    query: ListChatMessagesQuery,
  ) {
    await this.getThread(accountId, threadId)
    return this.repository.listMessages({
      ...(query.cursor ? { cursor: query.cursor } : {}),
      limit: query.limit,
      threadId,
    })
  }

  async createMessage(
    accountId: string,
    threadId: string,
    input: CreateChatMessageInput,
    options: { sourceClientId?: string } = {},
  ): Promise<ChatMessage> {
    await this.getThread(accountId, threadId)
    if (input.clientMessageId) {
      const existing = await this.repository.findMessageByClientId(threadId, input.clientMessageId)
      if (existing) {
        return existing
      }
    }

    const parts = await this.materializeParts(accountId, input.parts)
    if (parts.length === 0) {
      throw new HttpError(422, 'CHAT_MESSAGE_EMPTY', {
        fallbackMessage: 'Message content is required.',
        messageKey: 'api_error_chat_message_empty',
      })
    }
    const shouldGenerateAssistantResponse = input.assistantResponse !== false && Boolean(this.aiChatService)
    if (shouldGenerateAssistantResponse) {
      const result = await this.repository.createMessageWithAssistantRun({
        accountId,
        assistantMessageId: createId('chat_message'),
        assistantRunId: createId('chat_assistant_run'),
        ...(input.clientMessageId ? { clientMessageId: input.clientMessageId } : {}),
        maxAttempts: this.#assistantRunMaxAttempts,
        parts,
        threadId,
        timestamp: nowIso(),
        userMessageId: createId('chat_message'),
      })
      this.publishMessageCreated(threadId, result.userMessage, options.sourceClientId)
      this.publishMessageCreated(threadId, result.assistantMessage)
      this.scheduleAssistantRunDrain(threadId)
      return result.userMessage
    }

    const message = await this.repository.createMessage({
      accountId,
      ...(input.clientMessageId ? { clientMessageId: input.clientMessageId } : {}),
      id: createId('chat_message'),
      parts,
      threadId,
      timestamp: nowIso(),
    })
    this.publishMessageCreated(threadId, message, options.sourceClientId)
    return message
  }

  async reconcileAssistantRuns(): Promise<number> {
    if (!this.aiChatService) {
      return 0
    }
    const timestamp = nowIso()
    const staleBefore = new Date(Date.now() - this.#assistantRunStaleMs).toISOString()
    const staleThreadIds = await this.repository.requeueStaleAssistantRuns({
      staleBefore,
      timestamp,
    })
    const pendingThreadIds = await this.repository.listPendingAssistantRunThreadIds({
      limit: this.#assistantRunReconcileLimit,
      timestamp,
    })
    const threadIds = [...new Set([...staleThreadIds, ...pendingThreadIds])]
    for (const threadId of threadIds) {
      this.scheduleAssistantRunDrain(threadId)
    }
    return threadIds.length
  }

  async retryAssistantMessage(accountId: string, threadId: string, messageId: string): Promise<ChatMessage> {
    await this.getThread(accountId, threadId)
    const result = await this.repository.retryAssistantMessage({
      messageId,
      threadId,
      timestamp: nowIso(),
    })
    if (!result) {
      throw new HttpError(409, 'CHAT_ASSISTANT_MESSAGE_NOT_RETRYABLE', {
        fallbackMessage: 'This assistant message cannot be retried.',
        messageKey: 'api_error_chat_assistant_message_not_retryable',
      })
    }
    this.publish({
      createdAt: nowIso(),
      id: createChatEventId(),
      message: result.message,
      threadId,
      type: 'chat.message.updated',
    })
    this.scheduleAssistantRunDrain(threadId)
    return result.message
  }

  private publishMessageCreated(threadId: string, message: ChatMessage, sourceClientId?: string): void {
    this.publish({
      createdAt: nowIso(),
      id: createChatEventId(),
      message,
      ...(sourceClientId ? { sourceClientId } : {}),
      threadId,
      type: 'chat.message.created',
    })
  }

  private scheduleAssistantRunDrain(threadId: string): void {
    if (this.#assistantRunDrains.has(threadId)) {
      return
    }
    const drain = this.drainAssistantRuns(threadId)
      .catch((error) => {
        this.publishAssistantError(threadId, classifyChatAssistantError(error))
      })
      .finally(() => {
        this.#assistantRunDrains.delete(threadId)
      })
    this.#assistantRunDrains.set(threadId, drain)
  }

  private async drainAssistantRuns(threadId: string): Promise<void> {
    while (true) {
      const run = await this.repository.claimNextAssistantRun({
        threadId,
        timestamp: nowIso(),
      })
      if (!run) {
        return
      }
      await this.generateAssistantResponse(run)
    }
  }

  private async generateAssistantResponse(run: ChatAssistantRun): Promise<void> {
    if (!this.aiChatService) {
      await this.handleAssistantResponseFailure(
        run,
        toClassification('AI_NOT_CONFIGURED', 'AI service is not configured.'),
        '',
      )
      return
    }
    if (run.attemptCount > 1) {
      await this.resetAssistantMessageForRetry(run)
    }
    const history = await this.repository.listAssistantContext({
      assistantMessageId: run.assistantMessageId,
      limit: 24,
      threadId: run.threadId,
    })
    let pendingDelta = ''
    let latestText = ''
    let deltaSequence = 0
    let lastDeltaPublishedAt = 0
    const publishPendingDelta = () => {
      if (!pendingDelta) {
        return
      }
      deltaSequence += 1
      this.publish({
        createdAt: nowIso(),
        delta: pendingDelta,
        id: createChatEventId(),
        messageId: run.assistantMessageId,
        sequence: deltaSequence,
        status: 'streaming',
        text: latestText.slice(0, MAX_ASSISTANT_STREAM_TEXT_CHARS),
        threadId: run.threadId,
        type: 'chat.message.delta',
      })
      pendingDelta = ''
      lastDeltaPublishedAt = Date.now()
    }
    try {
      const response = await this.aiChatService.streamAssistantMessage(
        {
          accountId: run.accountId,
          history,
        },
        (chunk) => {
          pendingDelta += chunk.delta
          latestText = chunk.text
          if (
            lastDeltaPublishedAt === 0 ||
            Date.now() - lastDeltaPublishedAt >= STREAM_DELTA_FLUSH_MS ||
            pendingDelta.length >= STREAM_DELTA_FLUSH_CHARS
          ) {
            publishPendingDelta()
          }
        },
      )
      publishPendingDelta()
      const updated = await this.repository.updateMessage({
        id: run.assistantMessageId,
        parts: response.parts,
        status: response.status,
        threadId: run.threadId,
        timestamp: nowIso(),
      })
      await this.repository.completeAssistantRun({
        id: run.id,
        status: response.status === 'failed' ? 'failed' : 'succeeded',
        threadId: run.threadId,
        timestamp: nowIso(),
      })
      this.publish({
        createdAt: nowIso(),
        id: createChatEventId(),
        message: updated,
        threadId: run.threadId,
        type: 'chat.message.updated',
      })
    } catch (error) {
      await this.handleAssistantResponseFailure(run, error, latestText)
    }
  }

  private async resetAssistantMessageForRetry(run: ChatAssistantRun): Promise<void> {
    const updated = await this.repository.updateMessage({
      id: run.assistantMessageId,
      parts: [{ type: 'text', text: '' }],
      status: 'streaming',
      threadId: run.threadId,
      timestamp: nowIso(),
    })
    this.publish({
      createdAt: nowIso(),
      id: createChatEventId(),
      message: updated,
      threadId: run.threadId,
      type: 'chat.message.updated',
    })
  }

  private async handleAssistantResponseFailure(
    run: ChatAssistantRun,
    error: unknown,
    latestText: string,
  ): Promise<void> {
    const classification = error instanceof ClassifiedChatAssistantError
      ? error.classification
      : this.isAssistantErrorClassification(error) ? error : classifyChatAssistantError(error)
    await this.persistAssistantFailure(run, classification, latestText)
  }

  private isAssistantErrorClassification(error: unknown): error is ChatAssistantErrorClassification {
    return Boolean(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      'debugMessage' in error &&
      'message' in error &&
      'messageKey' in error &&
      'retryable' in error &&
      typeof error.retryable === 'boolean',
    )
  }

  private async persistAssistantFailure(
    run: ChatAssistantRun,
    classification: ChatAssistantErrorClassification,
    latestText: string,
  ): Promise<void> {
    const shouldRetry = classification.retryable && run.attemptCount < run.maxAttempts
    const retryState: ChatAssistantRetryState = shouldRetry
      ? 'retrying'
      : classification.retryable ? 'exhausted' : 'none'
    const status: ChatMessage['status'] = shouldRetry ? 'retrying' : 'failed'
    let updated: ChatMessage | undefined

    try {
      updated = await this.repository.updateMessage({
        id: run.assistantMessageId,
        parts: this.assistantFailureParts(latestText, classification, retryState),
        status,
        threadId: run.threadId,
        timestamp: nowIso(),
      })
    } catch (error) {
      const persistenceClassification = toClassification(
        'AI_RESPONSE_PERSIST_FAILED',
        error instanceof Error ? error.message : 'Failed to persist assistant response error.',
      )
      const shouldRetryPersistenceFailure = persistenceClassification.retryable && run.attemptCount < run.maxAttempts
      await this.persistAssistantRunAfterFailure(run, persistenceClassification, shouldRetryPersistenceFailure)
      this.publishAssistantError(run.threadId, persistenceClassification)
      return
    }

    await this.persistAssistantRunAfterFailure(run, classification, shouldRetry)
    if (updated) {
      this.publish({
        createdAt: nowIso(),
        id: createChatEventId(),
        message: updated,
        threadId: run.threadId,
        type: 'chat.message.updated',
      })
    }
    this.publishAssistantError(run.threadId, classification)
  }

  private async persistAssistantRunAfterFailure(
    run: ChatAssistantRun,
    classification: ChatAssistantErrorClassification,
    shouldRetry: boolean,
  ): Promise<void> {
    if (shouldRetry) {
      const retryDelayMs = this.assistantRetryDelayMs(run)
      await this.repository.retryAssistantRun({
        ...this.assistantRunErrorInput(classification),
        id: run.id,
        nextRetryAt: new Date(Date.now() + retryDelayMs).toISOString(),
        threadId: run.threadId,
        timestamp: nowIso(),
      })
      this.scheduleAssistantRunDrainAfter(run.threadId, retryDelayMs)
      return
    }
    await this.repository.completeAssistantRun({
      ...this.assistantRunErrorInput(classification),
      id: run.id,
      status: 'failed',
      threadId: run.threadId,
      timestamp: nowIso(),
    })
  }

  private assistantRunErrorInput(classification: ChatAssistantErrorClassification): {
    errorCode: ChatAssistantErrorCode
    errorDebugMessage: string
    errorMessageKey: string
    errorParams?: Record<string, string | number | boolean>
  } {
    return {
      errorCode: classification.code,
      errorDebugMessage: classification.debugMessage,
      errorMessageKey: classification.messageKey,
      ...(classification.params ? { errorParams: classification.params } : {}),
    }
  }

  private assistantFailureParts(
    latestText: string,
    classification: ChatAssistantErrorClassification,
    retryState: ChatAssistantRetryState,
  ): ChatMessagePart[] {
    const parts: ChatMessagePart[] = []
    const partialText = latestText.trim().slice(0, MAX_ASSISTANT_STREAM_TEXT_CHARS)
    if (partialText) {
      parts.push({ type: 'text', text: partialText })
    }
    parts.push({
      type: 'error',
      code: classification.code,
      message: classification.message,
      messageKey: classification.messageKey,
      ...(classification.params ? { params: classification.params } : {}),
      retryable: classification.retryable,
      retryState,
    })
    return parts
  }

  private assistantRetryDelayMs(run: ChatAssistantRun): number {
    const attemptIndex = Math.max(0, run.attemptCount - 1)
    const delay = this.#assistantRetryBaseMs * 2 ** attemptIndex
    return Math.min(Math.max(0, delay), this.#assistantRetryMaxMs)
  }

  private scheduleAssistantRunDrainAfter(threadId: string, delayMs: number): void {
    setTimeout(() => {
      this.scheduleAssistantRunDrain(threadId)
    }, delayMs)
  }

  private publishAssistantError(threadId: string, classification: ChatAssistantErrorClassification): void {
    this.publish({
      code: classification.code,
      createdAt: nowIso(),
      id: createChatEventId(),
      message: classification.message,
      threadId,
      type: 'chat.error',
    })
  }

  private async materializeParts(
    accountId: string,
    parts: CreateChatMessageInput['parts'],
  ): Promise<ChatMessagePart[]> {
    const materialized: ChatMessagePart[] = []
    for (const part of parts) {
      if (part.type === 'text') {
        const text = part.text.trim()
        if (text) {
          materialized.push(ChatMessagePartSchema.parse({ type: 'text', text }))
        }
        continue
      }
      const mediaObject = await this.mediaObjectService.getReadyMediaObject(accountId, part.mediaObjectId)
      if (mediaObject.status !== 'ready') {
        throw new HttpError(409, 'CHAT_ATTACHMENT_NOT_READY', {
          fallbackMessage: 'Chat attachment is not ready.',
          messageKey: 'api_error_chat_attachment_not_ready',
        })
      }
      if (mediaObject.purpose !== 'chat_attachment') {
        throw new HttpError(422, 'CHAT_ATTACHMENT_PURPOSE_INVALID', {
          fallbackMessage: 'Chat attachments must be uploaded with chat_attachment purpose.',
          messageKey: 'api_error_chat_attachment_invalid',
        })
      }
      if (part.type === 'image') {
        if (mediaObject.kind !== 'image') {
          throw new HttpError(422, 'CHAT_ATTACHMENT_TYPE_INVALID', {
            fallbackMessage: 'Chat image parts must reference image media objects.',
            messageKey: 'api_error_chat_attachment_invalid',
          })
        }
        materialized.push(ChatMessagePartSchema.parse({
          type: 'image',
          mediaObjectId: mediaObject.id,
          ...(part.alt ? { alt: part.alt } : {}),
          ...(mediaObject.byteSize !== undefined ? { byteSize: mediaObject.byteSize } : {}),
          ...(mediaObject.height ? { height: mediaObject.height } : {}),
          ...(mediaObject.mimeType ? { mimeType: mediaObject.mimeType } : {}),
          ...(mediaObject.width ? { width: mediaObject.width } : {}),
        }))
        continue
      }
      materialized.push(ChatMessagePartSchema.parse({
        type: 'file',
        mediaObjectId: mediaObject.id,
        name: part.name?.trim() || this.defaultFileName(mediaObject.id, mediaObject.mimeType),
        byteSize: mediaObject.byteSize,
        ...(mediaObject.mimeType ? { mimeType: mediaObject.mimeType } : {}),
      }))
    }
    return materialized
  }

  private defaultFileName(mediaObjectId: string, mimeType: string | undefined): string {
    if (!mimeType) {
      return mediaObjectId
    }
    const extension = mimeType.split('/')[1]?.split(';')[0]
    return extension ? `${mediaObjectId}.${extension}` : mediaObjectId
  }

  private publish(event: ChatEvent): void {
    this.eventPublisher.publish(event)
  }

  private threadNotFound(): HttpError {
    return new HttpError(404, 'CHAT_THREAD_NOT_FOUND', {
      fallbackMessage: 'Chat thread not found.',
      messageKey: 'api_error_chat_thread_not_found',
    })
  }
}
