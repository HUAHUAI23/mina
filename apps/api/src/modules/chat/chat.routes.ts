import {
  ChatMessageListResponseSchema,
  ChatMessageParamsSchema,
  ChatMessageResponseSchema,
  ChatThreadListResponseSchema,
  ChatThreadParamsSchema,
  ChatThreadResponseSchema,
  CreateChatMessageSchema,
  CreateChatThreadSchema,
  ListChatMessagesQuerySchema,
  ListChatThreadsQuerySchema,
} from '@mina/contracts/modules/chat'
import { upgradeWebSocket } from 'hono/bun'
import { Hono } from 'hono'

import { apiValidator } from '../../lib/http/validation'
import { requireAuthActor } from '../accounts/auth-middleware'
import type { AccountsService } from '../accounts/accounts.service'
import { createChatEventId, type ChatEventBus } from './chat-event-bus'
import type { ChatService } from './chat.service'

export const createChatRoutes = (
  chatService: ChatService,
  chatEventBus: ChatEventBus,
  accountsService: AccountsService,
): Hono =>
  new Hono()
    .get('/threads', apiValidator('query', ListChatThreadsQuerySchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const query = c.req.valid('query')
      return c.json(ChatThreadListResponseSchema.parse({
        items: await chatService.listThreads(actor.accountId, query.workflowId),
      }))
    })
    .post('/threads', apiValidator('json', CreateChatThreadSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const payload = c.req.valid('json')
      return c.json(ChatThreadResponseSchema.parse({
        item: await chatService.createThread(actor.accountId, payload),
      }), 201)
    })
    .get(
      '/threads/:threadId/messages',
      apiValidator('param', ChatThreadParamsSchema),
      apiValidator('query', ListChatMessagesQuerySchema),
      async (c) => {
        const actor = await requireAuthActor(c, accountsService)
        const { threadId } = c.req.valid('param')
        const query = c.req.valid('query')
        return c.json(ChatMessageListResponseSchema.parse(
          await chatService.listMessages(actor.accountId, threadId, query),
        ))
      },
    )
    .post(
      '/threads/:threadId/messages',
      apiValidator('param', ChatThreadParamsSchema),
      apiValidator('json', CreateChatMessageSchema),
      async (c) => {
        const actor = await requireAuthActor(c, accountsService)
        const { threadId } = c.req.valid('param')
        const payload = c.req.valid('json')
        const sourceClientId = c.req.header('X-Mina-Client-Id')?.trim() || undefined
        return c.json(ChatMessageResponseSchema.parse({
          item: await chatService.createMessage(actor.accountId, threadId, payload, {
            ...(sourceClientId ? { sourceClientId } : {}),
          }),
        }), 201)
      },
    )
    .post(
      '/threads/:threadId/messages/:messageId/retry',
      apiValidator('param', ChatMessageParamsSchema),
      async (c) => {
        const actor = await requireAuthActor(c, accountsService)
        const { messageId, threadId } = c.req.valid('param')
        return c.json(ChatMessageResponseSchema.parse({
          item: await chatService.retryAssistantMessage(actor.accountId, threadId, messageId),
        }))
      },
    )
    .get(
      '/threads/:threadId/events',
      apiValidator('param', ChatThreadParamsSchema),
      async (c, next) => {
        const actor = await requireAuthActor(c, accountsService)
        const { threadId } = c.req.valid('param')
        await chatService.getThread(actor.accountId, threadId)
        await next()
      },
      upgradeWebSocket((c) => {
        const threadId = c.req.param('threadId') ?? ''
        let unsubscribe: (() => void) | undefined

        return {
          onClose: () => {
            unsubscribe?.()
          },
          onOpen: (_event, ws) => {
            ws.send(JSON.stringify({
              createdAt: new Date().toISOString(),
              id: createChatEventId(),
              threadId,
              type: 'chat.connected',
            }))
            unsubscribe = chatEventBus.subscribe(threadId, (event) => {
              if (ws.readyState === 1) {
                ws.send(JSON.stringify(event))
              }
            })
          },
        }
      }),
    )
