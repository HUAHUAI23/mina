import { describe, expect, test } from 'bun:test'

import { parseChatEvent } from './chat-event'

describe('chat websocket helpers', () => {
  test('parses valid chat events', () => {
    const event = parseChatEvent(JSON.stringify({
      createdAt: '2026-01-01T00:00:00.000Z',
      id: 'chat_event_1',
      threadId: 'thread_1',
      type: 'chat.connected',
    }))

    expect(event?.type).toBe('chat.connected')
  })

  test('parses message delta events', () => {
    const event = parseChatEvent(JSON.stringify({
      createdAt: '2026-01-01T00:00:00.000Z',
      delta: 'Partial',
      id: 'chat_event_2',
      messageId: 'chat_message_1',
      sequence: 1,
      status: 'streaming',
      text: 'Partial response',
      threadId: 'thread_1',
      type: 'chat.message.delta',
    }))

    expect(event?.type).toBe('chat.message.delta')
    if (event?.type !== 'chat.message.delta') {
      throw new Error('Expected a chat message delta event.')
    }
    expect(event.delta).toBe('Partial')
    expect(event.messageId).toBe('chat_message_1')
    expect(event.sequence).toBe(1)
    expect(event.status).toBe('streaming')
    expect(event.text).toBe('Partial response')
  })

  test('ignores malformed payloads', () => {
    expect(parseChatEvent('{')).toBeUndefined()
    expect(parseChatEvent(JSON.stringify({ type: 'chat.connected' }))).toBeUndefined()
  })
})
