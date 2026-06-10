import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { applyChatMessageDelta, upsertChatMessage, type AgentChatMessageListCache } from '../domain/chat-message-cache'
import { parseChatEvent } from './chat-event'
import { chatKeys } from './chat-keys'
import { chatEventUrl, getAgentChatClientId } from './chat-ws'

const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 30_000
const SEEN_EVENT_LIMIT = 512
const nonRecoverableCloseCodes = new Set([1000, 1002, 1003, 1007, 1008])

export const useAgentChatEvents = (threadId: string | undefined): void => {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!threadId) {
      return
    }
    const activeThreadId = threadId
    const clientId = getAgentChatClientId()
    const seenEventIds = new Set<string>()
    const rememberEvent = (id: string): boolean => {
      if (seenEventIds.has(id)) {
        return false
      }
      seenEventIds.add(id)
      if (seenEventIds.size > SEEN_EVENT_LIMIT) {
        const oldest = seenEventIds.values().next().value
        if (oldest !== undefined) {
          seenEventIds.delete(oldest)
        }
      }
      return true
    }

    let socket: WebSocket | undefined
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    let reconnectAttempts = 0
    let disposed = false

    const scheduleReconnect = () => {
      if (disposed) {
        return
      }
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempts, RECONNECT_MAX_MS)
      reconnectAttempts += 1
      reconnectTimer = setTimeout(connect, delay)
    }

    function connect() {
      if (disposed) {
        return
      }
      const next = new WebSocket(chatEventUrl(activeThreadId), ['mina-chat'])
      socket = next
      next.onopen = () => {
        const wasReconnect = reconnectAttempts > 0
        reconnectAttempts = 0
        if (wasReconnect) {
          void queryClient.invalidateQueries({ queryKey: chatKeys.messages(activeThreadId) })
        }
      }
      next.onmessage = (message) => {
        if (typeof message.data !== 'string') {
          return
        }
        const event = parseChatEvent(message.data)
        if (!event || event.threadId !== activeThreadId || event.sourceClientId === clientId || !rememberEvent(event.id)) {
          return
        }
        if (event.type === 'chat.message.created' || event.type === 'chat.message.updated') {
          queryClient.setQueryData<AgentChatMessageListCache>(
            chatKeys.messages(activeThreadId),
            (current) => upsertChatMessage(current, event.message),
          )
          return
        }
        if (event.type === 'chat.message.delta') {
          const queryKey = chatKeys.messages(activeThreadId)
          const current = queryClient.getQueryData<AgentChatMessageListCache>(queryKey)
          if (!current?.items.some((message) => message.id === event.messageId)) {
            void queryClient.invalidateQueries({ queryKey: chatKeys.messages(activeThreadId) })
            return
          }
          queryClient.setQueryData<AgentChatMessageListCache>(
            queryKey,
            (cached) => applyChatMessageDelta(cached, {
              messageId: event.messageId,
              sequence: event.sequence,
              ...(event.status ? { status: event.status } : {}),
              text: event.text,
            }),
          )
        }
      }
      next.onclose = (event) => {
        if (socket === next) {
          socket = undefined
        }
        if (nonRecoverableCloseCodes.has(event.code)) {
          return
        }
        scheduleReconnect()
      }
      next.onerror = () => {
        next.close()
      }
    }

    connect()

    return () => {
      disposed = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
      }
      const active = socket
      if (!active) {
        return
      }
      active.onclose = null
      active.onerror = null
      active.onmessage = null
      if (active.readyState === WebSocket.CONNECTING) {
        active.addEventListener('open', () => active.close(), { once: true })
        return
      }
      active.close()
    }
  }, [queryClient, threadId])
}
