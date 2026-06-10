import type { ChatMessage, ChatMessageListResponse, CreateChatMessageInput } from '@mina/contracts/modules/chat'

export type AgentChatMessage = ChatMessageListResponse['items'][number]
export type AgentChatMessageListCache = ChatMessageListResponse & {
  streamSequences?: Record<string, number> | undefined
}

const messageIdentityMatches = (left: AgentChatMessage, right: AgentChatMessage): boolean =>
  left.id === right.id ||
  Boolean(left.clientMessageId && right.clientMessageId && left.clientMessageId === right.clientMessageId)

const compareMessages = (left: AgentChatMessage, right: AgentChatMessage): number => {
  const byOrderIndex = left.orderIndex - right.orderIndex
  if (Number.isFinite(byOrderIndex) && byOrderIndex !== 0) {
    return byOrderIndex
  }
  const byCreatedAt = left.createdAt.localeCompare(right.createdAt)
  return byCreatedAt === 0 ? left.id.localeCompare(right.id) : byCreatedAt
}

export const upsertChatMessage = (
  current: AgentChatMessageListCache | undefined,
  message: AgentChatMessage,
): AgentChatMessageListCache => {
  const items = current?.items ?? []
  const index = items.findIndex((item) => messageIdentityMatches(item, message))
  const nextItems = index >= 0
    ? items.map((item, itemIndex) => itemIndex === index ? message : item)
    : [...items, message]
  const streamSequences = current?.streamSequences
    ? { ...current.streamSequences }
    : undefined
  if (message.status !== 'streaming' && streamSequences) {
    delete streamSequences[message.id]
  }

  return {
    items: [...nextItems].sort(compareMessages),
    ...(current?.nextCursor ? { nextCursor: current.nextCursor } : {}),
    ...(streamSequences && Object.keys(streamSequences).length > 0 ? { streamSequences } : {}),
  }
}

export const mergeChatHistoryPage = (
  current: AgentChatMessageListCache | undefined,
  page: ChatMessageListResponse,
): AgentChatMessageListCache => {
  const merged = page.items.reduce(
    (result, message) => upsertChatMessage(result, message),
    current ?? { items: [] },
  )
  return {
    items: merged.items,
    ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    ...(merged.streamSequences && Object.keys(merged.streamSequences).length > 0
      ? { streamSequences: merged.streamSequences }
      : {}),
  }
}

export const applyChatMessageDelta = (
  current: AgentChatMessageListCache | undefined,
  input: { messageId: string; sequence: number; status?: ChatMessage['status']; text: string },
): AgentChatMessageListCache | undefined => {
  if (!current) {
    return undefined
  }
  const currentSequence = current.streamSequences?.[input.messageId] ?? 0
  if (input.sequence <= currentSequence) {
    return current
  }
  const messageIndex = current.items.findIndex((message) => message.id === input.messageId)
  if (messageIndex < 0) {
    return current
  }
  return {
    items: current.items.map((message, index) => {
      if (index !== messageIndex) {
        return message
      }
      const textPartIndex = message.parts.findIndex((part) => part.type === 'text')
      const parts = textPartIndex >= 0
        ? message.parts.map((part, index) =>
            index === textPartIndex && part.type === 'text'
              ? { ...part, text: input.text }
              : part
          )
        : [{ type: 'text' as const, text: input.text }, ...message.parts]
      return {
        ...message,
        parts,
        status: input.status ?? message.status,
        updatedAt: new Date().toISOString(),
      }
    }),
    ...(current.nextCursor ? { nextCursor: current.nextCursor } : {}),
    streamSequences: {
      ...(current.streamSequences ?? {}),
      [input.messageId]: input.sequence,
    },
  }
}

export const createOptimisticChatMessage = (
  threadId: string,
  input: CreateChatMessageInput,
  orderIndex = Number.MAX_SAFE_INTEGER,
): ChatMessage => {
  const createdAt = new Date().toISOString()
  return {
    accountId: 'optimistic',
    clientMessageId: input.clientMessageId,
    createdAt,
    id: `optimistic_${input.clientMessageId ?? crypto.randomUUID()}`,
    orderIndex,
    parts: input.parts.map((part) => {
      if (part.type === 'text' || part.type === 'image') {
        return part
      }
      return { ...part, name: part.name ?? part.mediaObjectId }
    }),
    role: 'user',
    status: 'sent',
    threadId,
    updatedAt: createdAt,
  }
}
