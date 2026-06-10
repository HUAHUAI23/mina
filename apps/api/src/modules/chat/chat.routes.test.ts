import { describe, expect, test } from 'bun:test'
import {
  ChatEventSchema,
  ChatMessageListResponseSchema,
  ChatMessageResponseSchema,
  ChatThreadListResponseSchema,
  ChatThreadResponseSchema,
  type ChatEvent,
} from '@mina/contracts/modules/chat'
import { MediaObjectResponseSchema } from '@mina/contracts/modules/media/media-object'
import { websocket } from 'hono/bun'

import { createTestApp } from '../../test/app'
import type {
  AssistantChatResponder,
  GenerateAssistantMessageInput,
  GenerateAssistantMessageResult,
  StreamAssistantMessageDelta,
} from './ai-chat.service'

class OnceFailingRouteAssistant implements AssistantChatResponder {
  calls: GenerateAssistantMessageInput[] = []
  failuresRemaining = 1

  isEnabled(): boolean {
    return true
  }

  async generateAssistantMessage(input: GenerateAssistantMessageInput): Promise<GenerateAssistantMessageResult> {
    return this.streamAssistantMessage(input, () => undefined)
  }

  async streamAssistantMessage(
    input: GenerateAssistantMessageInput,
    onDelta: (delta: StreamAssistantMessageDelta) => void | Promise<void>,
  ): Promise<GenerateAssistantMessageResult> {
    this.calls.push(input)
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1
      throw new Error('fetch failed')
    }
    const text = 'Retried route assistant response.'
    await onDelta({ delta: text, text })
    return {
      parts: [{ type: 'text', text }],
      status: 'sent',
    }
  }
}

const pngBytes = new Uint8Array([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
])

const readAuthToken = (value: unknown): string => {
  if (
    value &&
    typeof value === 'object' &&
    'session' in value &&
    value.session &&
    typeof value.session === 'object' &&
    'token' in value.session &&
    typeof value.session.token === 'string'
  ) {
    return value.session.token
  }
  throw new Error('Registration response did not include a session token.')
}

const readItemId = (value: unknown): string => {
  if (
    value &&
    typeof value === 'object' &&
    'item' in value &&
    value.item &&
    typeof value.item === 'object' &&
    'id' in value.item &&
    typeof value.item.id === 'string'
  ) {
    return value.item.id
  }
  throw new Error('Response did not include an item id.')
}

const waitForTimestampBoundary = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 2))
}

const waitFor = async (predicate: () => boolean | Promise<boolean>): Promise<void> => {
  const startedAt = Date.now()
  while (!await predicate()) {
    if (Date.now() - startedAt > 2_000) {
      throw new Error('Timed out waiting for chat route test condition.')
    }
    await Bun.sleep(10)
  }
}

const waitForOpen = (socket: WebSocket): Promise<void> =>
  new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true })
    socket.addEventListener('error', () => reject(new Error('WebSocket connection failed.')), { once: true })
  })

const collectChatEvents = (socket: WebSocket): ChatEvent[] => {
  const events: ChatEvent[] = []
  socket.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') {
      return
    }
    const parsed = ChatEventSchema.safeParse(JSON.parse(event.data))
    if (parsed.success) {
      events.push(parsed.data)
    }
  })
  return events
}

const register = async (app: ReturnType<typeof createTestApp>) => {
  const response = await app.request('/api/auth/register', {
    body: JSON.stringify({
      email: `chat-${crypto.randomUUID()}@example.com`,
      password: 'correct horse battery staple',
      username: `chat_${crypto.randomUUID().slice(0, 8)}`,
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
  expect(response.status).toBe(201)
  return readAuthToken(await response.json())
}

const createWorkflow = async (app: ReturnType<typeof createTestApp>, token: string): Promise<string> => {
  const response = await app.request('/api/workflows', {
    body: JSON.stringify({ edges: [], name: 'Chat canvas', nodes: [] }),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
  expect(response.status).toBe(201)
  return readItemId(await response.json())
}

const createThread = async (
  app: ReturnType<typeof createTestApp>,
  token: string,
  workflowId: string,
): Promise<string> => {
  const response = await app.request('/api/chat/threads', {
    body: JSON.stringify({ workflowId }),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
  expect(response.status).toBe(201)
  return ChatThreadResponseSchema.parse(await response.json()).item.id
}

const uploadChatImage = async (app: ReturnType<typeof createTestApp>, token: string): Promise<string> => {
  const form = new FormData()
  form.set('file', new File([pngBytes], 'reference.png', { type: 'image/png' }))
  form.set('purpose', 'chat_attachment')
  form.set('retention', 'project_scoped')
  const response = await app.request('/api/media-objects', {
    body: form,
    headers: { Authorization: `Bearer ${token}` },
    method: 'POST',
  })
  expect(response.status).toBe(201)
  return MediaObjectResponseSchema.parse(await response.json()).item.id
}

const uploadChatFile = async (app: ReturnType<typeof createTestApp>, token: string): Promise<string> => {
  const form = new FormData()
  form.set('file', new File(['plain text attachment'], 'notes.txt', { type: 'text/plain' }))
  form.set('purpose', 'chat_attachment')
  form.set('retention', 'project_scoped')
  const response = await app.request('/api/media-objects', {
    body: form,
    headers: { Authorization: `Bearer ${token}` },
    method: 'POST',
  })
  expect(response.status).toBe(201)
  const mediaObject = MediaObjectResponseSchema.parse(await response.json()).item
  expect(mediaObject.kind).toBe('file')
  return mediaObject.id
}

const uploadWorkflowImage = async (app: ReturnType<typeof createTestApp>, token: string): Promise<string> => {
  const form = new FormData()
  form.set('file', new File([pngBytes], 'workflow.png', { type: 'image/png' }))
  form.set('purpose', 'workflow_slot')
  form.set('retention', 'project_scoped')
  const response = await app.request('/api/media-objects', {
    body: form,
    headers: { Authorization: `Bearer ${token}` },
    method: 'POST',
  })
  expect(response.status).toBe(201)
  return MediaObjectResponseSchema.parse(await response.json()).item.id
}

describe('chat routes', () => {
  test('reuses the active workflow thread for repeated create requests', async () => {
    const app = createTestApp()
    const ownerToken = await register(app)
    const otherToken = await register(app)
    const workflowId = await createWorkflow(app, ownerToken)
    const firstThreadId = await createThread(app, ownerToken, workflowId)
    const secondThreadId = await createThread(app, ownerToken, workflowId)

    expect(secondThreadId).toBe(firstThreadId)

    const threadsResponse = await app.request(`/api/chat/threads?workflowId=${encodeURIComponent(workflowId)}`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    })
    expect(threadsResponse.status).toBe(200)
    const threads = ChatThreadListResponseSchema.parse(await threadsResponse.json())
    expect(threads.items.map((thread) => thread.id)).toEqual([firstThreadId])

    const otherCreateResponse = await app.request('/api/chat/threads', {
      body: JSON.stringify({ workflowId }),
      headers: {
        Authorization: `Bearer ${otherToken}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
    expect(otherCreateResponse.status).toBe(404)
  })

  test('creates workflow-scoped threads and stores text plus attachment messages', async () => {
    const app = createTestApp()
    const token = await register(app)
    const workflowId = await createWorkflow(app, token)
    const threadId = await createThread(app, token, workflowId)
    const mediaObjectId = await uploadChatImage(app, token)
    const fileMediaObjectId = await uploadChatFile(app, token)

    const sendResponse = await app.request(`/api/chat/threads/${threadId}/messages`, {
      body: JSON.stringify({
        clientMessageId: 'client-message-1',
        parts: [
          { type: 'text', text: 'Create a brighter version.' },
          { type: 'image', mediaObjectId, alt: 'Reference' },
          { type: 'file', mediaObjectId: fileMediaObjectId, name: 'notes.txt' },
        ],
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
    expect(sendResponse.status).toBe(201)
    const sent = ChatMessageResponseSchema.parse(await sendResponse.json()).item
    expect(sent.clientMessageId).toBe('client-message-1')
    expect(sent.parts.map((part) => part.type)).toEqual(['text', 'image', 'file'])

    const duplicateResponse = await app.request(`/api/chat/threads/${threadId}/messages`, {
      body: JSON.stringify({
        clientMessageId: 'client-message-1',
        parts: [{ type: 'text', text: 'Duplicate retry.' }],
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
    expect(duplicateResponse.status).toBe(201)
    const duplicate = ChatMessageResponseSchema.parse(await duplicateResponse.json()).item
    expect(duplicate.id).toBe(sent.id)

    const listResponse = await app.request(`/api/chat/threads/${threadId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(listResponse.status).toBe(200)
    const listed = ChatMessageListResponseSchema.parse(await listResponse.json())
    expect(listed.items).toHaveLength(1)
    expect(listed.items[0]?.parts.map((part) => part.type)).toEqual(['text', 'image', 'file'])

    const threadsResponse = await app.request(`/api/chat/threads?workflowId=${encodeURIComponent(workflowId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(threadsResponse.status).toBe(200)
    const threads = ChatThreadListResponseSchema.parse(await threadsResponse.json())
    expect(threads.items.map((thread) => thread.id)).toEqual([threadId])
  })

  test('publishes thread websocket events to authorized clients', async () => {
    const app = createTestApp()
    const token = await register(app)
    const workflowId = await createWorkflow(app, token)
    const threadId = await createThread(app, token, workflowId)
    const server = Bun.serve({ fetch: app.fetch, port: 0, websocket })
    const firstSocket = new WebSocket(
      `ws://127.0.0.1:${server.port}/api/chat/threads/${threadId}/events`,
      ['mina-chat', `mina-token.${token}`],
    )
    const secondSocket = new WebSocket(
      `ws://127.0.0.1:${server.port}/api/chat/threads/${threadId}/events`,
      ['mina-chat', `mina-token.${token}`],
    )
    const firstEvents = collectChatEvents(firstSocket)
    const secondEvents = collectChatEvents(secondSocket)

    try {
      await Promise.all([waitForOpen(firstSocket), waitForOpen(secondSocket)])
      await waitFor(() =>
        firstEvents.some((event) => event.type === 'chat.connected') &&
        secondEvents.some((event) => event.type === 'chat.connected')
      )

      const sendResponse = await app.request(`/api/chat/threads/${threadId}/messages`, {
        body: JSON.stringify({
          assistantResponse: false,
          clientMessageId: 'ws-message-1',
          parts: [{ type: 'text', text: 'Broadcast this message.' }],
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      })
      expect(sendResponse.status).toBe(201)
      await waitFor(() =>
        firstEvents.some((event) =>
          event.type === 'chat.message.created' && event.message.clientMessageId === 'ws-message-1'
        ) &&
        secondEvents.some((event) =>
          event.type === 'chat.message.created' && event.message.clientMessageId === 'ws-message-1'
        )
      )
    } finally {
      firstSocket.close()
      secondSocket.close()
      await server.stop(true)
    }
  })

  test('rejects thread websocket event streams without authentication', async () => {
    const app = createTestApp()
    const token = await register(app)
    const workflowId = await createWorkflow(app, token)
    const threadId = await createThread(app, token, workflowId)
    const response = await app.request(`/api/chat/threads/${threadId}/events`)

    expect(response.status).toBe(401)
  })

  test('can disable assistant response generation per message', async () => {
    const app = createTestApp()
    const token = await register(app)
    const workflowId = await createWorkflow(app, token)
    const threadId = await createThread(app, token, workflowId)

    const sendResponse = await app.request(`/api/chat/threads/${threadId}/messages`, {
      body: JSON.stringify({
        assistantResponse: false,
        clientMessageId: 'without-assistant',
        parts: [{ type: 'text', text: 'Store only this user message.' }],
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
    expect(sendResponse.status).toBe(201)

    const listResponse = await app.request(`/api/chat/threads/${threadId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(listResponse.status).toBe(200)
    const listed = ChatMessageListResponseSchema.parse(await listResponse.json())
    expect(listed.items.map((message) => message.role)).toEqual(['user'])
  })

  test('retries a failed assistant message through the route', async () => {
    const assistant = new OnceFailingRouteAssistant()
    const app = createTestApp({
      assistantChatResponder: assistant,
      assistantRunMaxAttempts: 1,
    })
    const token = await register(app)
    const workflowId = await createWorkflow(app, token)
    const threadId = await createThread(app, token, workflowId)

    const sendResponse = await app.request(`/api/chat/threads/${threadId}/messages`, {
      body: JSON.stringify({
        parts: [{ type: 'text', text: 'Retry this assistant response.' }],
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
    expect(sendResponse.status).toBe(201)
    await waitFor(async () => {
      const response = await app.request(`/api/chat/threads/${threadId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const listed = ChatMessageListResponseSchema.parse(await response.json())
      return listed.items[1]?.status === 'failed'
    })

    const failedListResponse = await app.request(`/api/chat/threads/${threadId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const failedList = ChatMessageListResponseSchema.parse(await failedListResponse.json())
    const failedAssistant = failedList.items[1]
    expect(failedAssistant?.parts[0]).toMatchObject({
      code: 'AI_PROVIDER_NETWORK',
      retryState: 'exhausted',
      retryable: true,
      type: 'error',
    })

    const retryResponse = await app.request(
      `/api/chat/threads/${threadId}/messages/${failedAssistant?.id ?? ''}/retry`,
      {
        headers: { Authorization: `Bearer ${token}` },
        method: 'POST',
      },
    )
    expect(retryResponse.status).toBe(200)
    const retryPayload = ChatMessageResponseSchema.parse(await retryResponse.json())
    expect(retryPayload.item.status).toBe('streaming')

    await waitFor(async () => {
      const response = await app.request(`/api/chat/threads/${threadId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const listed = ChatMessageListResponseSchema.parse(await response.json())
      return listed.items[1]?.status === 'sent'
    })
    expect(assistant.calls).toHaveLength(2)
  })

  test('paginates thread messages with a stable cursor', async () => {
    const app = createTestApp()
    const token = await register(app)
    const workflowId = await createWorkflow(app, token)
    const threadId = await createThread(app, token, workflowId)

    for (let index = 0; index < 4; index += 1) {
      const response = await app.request(`/api/chat/threads/${threadId}/messages`, {
        body: JSON.stringify({
          clientMessageId: `page-message-${index}`,
          parts: [{ type: 'text', text: `Message ${index}` }],
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      })
      expect(response.status).toBe(201)
      await waitForTimestampBoundary()
    }

    const firstPageResponse = await app.request(`/api/chat/threads/${threadId}/messages?limit=2`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(firstPageResponse.status).toBe(200)
    const firstPage = ChatMessageListResponseSchema.parse(await firstPageResponse.json())
    expect(firstPage.items.map((message) => message.clientMessageId)).toEqual(['page-message-2', 'page-message-3'])
    expect(firstPage.nextCursor).toBe(firstPage.items[0]?.id)

    const secondPageResponse = await app.request(
      `/api/chat/threads/${threadId}/messages?limit=2&cursor=${encodeURIComponent(firstPage.nextCursor ?? '')}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    expect(secondPageResponse.status).toBe(200)
    const secondPage = ChatMessageListResponseSchema.parse(await secondPageResponse.json())
    expect(secondPage.items.map((message) => message.clientMessageId)).toEqual(['page-message-0', 'page-message-1'])
    expect(secondPage.nextCursor).toBeUndefined()
  })

  test('rejects non-chat attachments and mismatched image parts', async () => {
    const app = createTestApp()
    const token = await register(app)
    const workflowId = await createWorkflow(app, token)
    const threadId = await createThread(app, token, workflowId)
    const workflowMediaObjectId = await uploadWorkflowImage(app, token)
    const chatFileObjectId = await uploadChatFile(app, token)

    const wrongPurposeResponse = await app.request(`/api/chat/threads/${threadId}/messages`, {
      body: JSON.stringify({
        parts: [{ type: 'image', mediaObjectId: workflowMediaObjectId }],
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
    expect(wrongPurposeResponse.status).toBe(422)

    const wrongTypeResponse = await app.request(`/api/chat/threads/${threadId}/messages`, {
      body: JSON.stringify({
        parts: [{ type: 'image', mediaObjectId: chatFileObjectId }],
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
    expect(wrongTypeResponse.status).toBe(422)
  })

  test('rejects cross-account thread access', async () => {
    const app = createTestApp()
    const ownerToken = await register(app)
    const otherToken = await register(app)
    const workflowId = await createWorkflow(app, ownerToken)
    const threadId = await createThread(app, ownerToken, workflowId)

    const response = await app.request(`/api/chat/threads/${threadId}/messages`, {
      body: JSON.stringify({ parts: [{ type: 'text', text: 'Unauthorized.' }] }),
      headers: {
        Authorization: `Bearer ${otherToken}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })

    expect(response.status).toBe(404)
  })
})
