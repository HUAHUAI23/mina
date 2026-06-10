import type {
  ChatAssistantErrorCode,
  ChatMessage,
  ChatMessagePart,
  ChatMessageRole,
  ChatMessageStatus,
  ChatThread,
  CreateChatThreadInput,
} from '@mina/contracts/modules/chat'

export type ChatAssistantRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
export type TerminalChatAssistantRunStatus = Exclude<ChatAssistantRunStatus, 'queued' | 'running'>

export interface ChatAssistantRun {
  accountId: string
  assistantMessageId: string
  attemptCount: number
  createdAt: string
  errorCode?: ChatAssistantErrorCode
  errorDebugMessage?: string
  errorMessageKey?: string
  errorParams?: Record<string, string | number | boolean>
  finishedAt?: string
  id: string
  maxAttempts: number
  nextRetryAt?: string
  startedAt?: string
  status: ChatAssistantRunStatus
  threadId: string
  updatedAt: string
  userMessageId: string
}

export interface CreateChatThreadRecordInput extends CreateChatThreadInput {
  accountId: string
  id: string
  timestamp: string
}

export interface CreateChatMessageRecordInput {
  accountId: string
  clientMessageId?: string
  id: string
  parts: ChatMessagePart[]
  role?: ChatMessageRole
  status?: ChatMessage['status']
  threadId: string
  timestamp: string
}

export interface UpdateChatMessageRecordInput {
  id: string
  parts: ChatMessagePart[]
  status: ChatMessageStatus
  threadId: string
  timestamp: string
}

export interface CreateChatMessageWithAssistantRunInput {
  accountId: string
  assistantMessageId: string
  assistantRunId: string
  clientMessageId?: string
  maxAttempts: number
  parts: ChatMessagePart[]
  threadId: string
  timestamp: string
  userMessageId: string
}

export interface CreateChatMessageWithAssistantRunResult {
  assistantMessage: ChatMessage
  assistantRun: ChatAssistantRun
  userMessage: ChatMessage
}

export interface ListChatMessagesInput {
  cursor?: string
  limit: number
  threadId: string
}

export interface ListChatAssistantContextInput {
  assistantMessageId: string
  limit: number
  threadId: string
}

export interface ListPendingChatAssistantRunThreadsInput {
  limit: number
  timestamp: string
}

export interface ListChatMessagesResult {
  items: ChatMessage[]
  nextCursor?: string
}

export interface ClaimNextChatAssistantRunInput {
  threadId: string
  timestamp: string
}

export interface CompleteChatAssistantRunInput {
  errorCode?: ChatAssistantErrorCode
  errorDebugMessage?: string
  errorMessageKey?: string
  errorParams?: Record<string, string | number | boolean>
  id: string
  status: TerminalChatAssistantRunStatus
  threadId: string
  timestamp: string
}

export interface RetryChatAssistantRunInput {
  errorCode?: ChatAssistantErrorCode
  errorDebugMessage?: string
  errorMessageKey?: string
  errorParams?: Record<string, string | number | boolean>
  id: string
  nextRetryAt: string
  threadId: string
  timestamp: string
}

export interface RetryAssistantMessageInput {
  messageId: string
  threadId: string
  timestamp: string
}

export interface RequeueStaleChatAssistantRunsInput {
  staleBefore: string
  timestamp: string
}

export interface ChatRepository {
  createMessage(input: CreateChatMessageRecordInput): Promise<ChatMessage>
  createMessageWithAssistantRun(input: CreateChatMessageWithAssistantRunInput): Promise<CreateChatMessageWithAssistantRunResult>
  createThread(input: CreateChatThreadRecordInput): Promise<ChatThread>
  claimNextAssistantRun(input: ClaimNextChatAssistantRunInput): Promise<ChatAssistantRun | undefined>
  completeAssistantRun(input: CompleteChatAssistantRunInput): Promise<ChatAssistantRun>
  findMessageByClientId(threadId: string, clientMessageId: string): Promise<ChatMessage | undefined>
  findActiveThreadByWorkflow(accountId: string, workflowId: string): Promise<ChatThread | undefined>
  findThreadById(accountId: string, threadId: string): Promise<ChatThread | undefined>
  listAssistantContext(input: ListChatAssistantContextInput): Promise<ChatMessage[]>
  listMessages(input: ListChatMessagesInput): Promise<ListChatMessagesResult>
  listPendingAssistantRunThreadIds(input: ListPendingChatAssistantRunThreadsInput): Promise<string[]>
  listThreads(accountId: string, workflowId?: string): Promise<ChatThread[]>
  retryAssistantMessage(input: RetryAssistantMessageInput): Promise<{ message: ChatMessage; run: ChatAssistantRun } | undefined>
  retryAssistantRun(input: RetryChatAssistantRunInput): Promise<ChatAssistantRun>
  requeueStaleAssistantRuns(input: RequeueStaleChatAssistantRunsInput): Promise<string[]>
  updateMessage(input: UpdateChatMessageRecordInput): Promise<ChatMessage>
}
