import { describe, expect, test } from 'bun:test'
import type { ChatMessage, ChatMessageListResponse } from '@mina/contracts/modules/chat'

import {
  applyChatMessageDelta,
  createOptimisticChatMessage,
  mergeChatHistoryPage,
  upsertChatMessage,
} from './chat-message-cache'

const message = (patch: Partial<ChatMessage> & Pick<ChatMessage, 'id'>): ChatMessage => ({
  accountId: patch.accountId ?? 'account_1',
  createdAt: patch.createdAt ?? '2026-01-01T00:00:00.000Z',
  id: patch.id,
  orderIndex: patch.orderIndex ?? 0,
  parts: patch.parts ?? [{ type: 'text', text: patch.id }],
  role: patch.role ?? 'user',
  status: patch.status ?? 'sent',
  threadId: patch.threadId ?? 'thread_1',
  updatedAt: patch.updatedAt ?? patch.createdAt ?? '2026-01-01T00:00:00.000Z',
  ...(patch.clientMessageId ? { clientMessageId: patch.clientMessageId } : {}),
})

describe('chat message cache helpers', () => {
  test('sorts messages by durable orderIndex when upserting', () => {
    const current: ChatMessageListResponse = {
      items: [
        message({ createdAt: '2026-01-01T00:00:02.000Z', id: 'message_2', orderIndex: 2 }),
        message({ createdAt: '2026-01-01T00:00:01.000Z', id: 'message_1', orderIndex: 1 }),
      ],
      nextCursor: 'cursor_1',
    }

    const next = upsertChatMessage(
      current,
      message({ createdAt: '2026-01-01T00:00:03.000Z', id: 'message_0', orderIndex: 0 }),
    )

    expect(next.items.map((item) => item.id)).toEqual(['message_0', 'message_1', 'message_2'])
    expect(next.nextCursor).toBe('cursor_1')
  })

  test('replaces optimistic messages by clientMessageId', () => {
    const optimistic = createOptimisticChatMessage('thread_1', {
      clientMessageId: 'client_1',
      parts: [{ type: 'text', text: 'Draft' }],
    }, 4)

    const next = upsertChatMessage(
      { items: [optimistic] },
      message({
        clientMessageId: 'client_1',
        createdAt: '2026-01-01T00:00:03.000Z',
        id: 'message_final',
        orderIndex: 4,
        parts: [{ type: 'text', text: 'Draft' }],
      }),
    )

    expect(next.items).toHaveLength(1)
    expect(next.items[0]?.id).toBe('message_final')
  })

  test('moves the cursor to the loaded older page', () => {
    const current: ChatMessageListResponse = {
      items: [message({ createdAt: '2026-01-01T00:00:03.000Z', id: 'message_3' })],
      nextCursor: 'message_3',
    }
    const page: ChatMessageListResponse = {
      items: [message({ createdAt: '2026-01-01T00:00:01.000Z', id: 'message_1' })],
      nextCursor: 'message_1',
    }

    const merged = mergeChatHistoryPage(current, page)

    expect(merged.items.map((item) => item.id)).toEqual(['message_1', 'message_3'])
    expect(merged.nextCursor).toBe('message_1')
  })

  test('keeps stream sequence state when merging older history', () => {
    const current = {
      items: [
        message({
          id: 'message_assistant',
          orderIndex: 3,
          parts: [{ type: 'text', text: 'Fresh response' }],
          role: 'assistant',
          status: 'streaming',
        }),
      ],
      nextCursor: 'message_assistant',
      streamSequences: { message_assistant: 2 },
    }
    const page: ChatMessageListResponse = {
      items: [message({ id: 'message_older', orderIndex: 1 })],
    }

    const merged = mergeChatHistoryPage(current, page)
    const stale = applyChatMessageDelta(merged, {
      messageId: 'message_assistant',
      sequence: 1,
      text: 'Old response',
    })

    expect(stale?.items.find((item) => item.id === 'message_assistant')?.parts)
      .toEqual([{ type: 'text', text: 'Fresh response' }])
    expect(stale?.streamSequences?.message_assistant).toBe(2)
  })

  test('applies stream deltas to the existing assistant message', () => {
    const current: ChatMessageListResponse = {
      items: [
        message({ id: 'message_user', parts: [{ type: 'text', text: 'Hello' }] }),
        message({
          id: 'message_assistant',
          parts: [{ type: 'text', text: '' }],
          role: 'assistant',
          status: 'streaming',
        }),
      ],
      nextCursor: 'cursor_1',
    }

    const next = applyChatMessageDelta(current, {
      messageId: 'message_assistant',
      sequence: 1,
      status: 'streaming',
      text: 'Partial response',
    })

    expect(next).toBeDefined()
    if (!next) {
      throw new Error('Expected delta application to return cache data.')
    }
    expect(next.items).toHaveLength(2)
    expect(next.items[1]?.parts).toEqual([{ type: 'text', text: 'Partial response' }])
    expect(next.items[1]?.status).toBe('streaming')
    expect(next.nextCursor).toBe('cursor_1')
  })

  test('ignores stale stream deltas', () => {
    const current: ChatMessageListResponse = {
      items: [
        message({
          id: 'message_assistant',
          parts: [{ type: 'text', text: 'Fresh response' }],
          role: 'assistant',
          status: 'streaming',
        }),
      ],
    }
    const fresh = applyChatMessageDelta(current, {
      messageId: 'message_assistant',
      sequence: 2,
      text: 'Fresh response',
    })
    const stale = applyChatMessageDelta(fresh, {
      messageId: 'message_assistant',
      sequence: 1,
      text: 'Old response',
    })

    expect(stale).toBeDefined()
    if (!stale) {
      throw new Error('Expected stale delta handling to return cache data.')
    }
    expect(stale.items[0]?.parts).toEqual([{ type: 'text', text: 'Fresh response' }])
  })

  test('keeps cache unchanged when a stream delta arrives before the message', () => {
    const current: ChatMessageListResponse = {
      items: [message({ id: 'message_user' })],
    }

    const next = applyChatMessageDelta(current, {
      messageId: 'message_missing',
      sequence: 1,
      text: 'Missing response',
    })

    expect(next).toEqual(current)
  })
})
