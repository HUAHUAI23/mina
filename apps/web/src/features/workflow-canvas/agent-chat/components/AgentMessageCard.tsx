import { useRef } from 'react'
import { ArrowDownToLine, Loader2, RefreshCw, X } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@mina/ui/components/button'
import { useStickToBottom } from 'use-stick-to-bottom'

import { useMessages } from '../../../../app/i18n-provider'
import { getErrorMessage } from '../../../../lib/http'
import { mergeChatHistoryPage, upsertChatMessage, type AgentChatMessageListCache } from '../domain/chat-message-cache'
import { chatKeys } from '../api/chat-keys'
import { listChatMessages, retryChatMessage } from '../api/chat-client'
import { AgentMessageList } from './AgentMessageList'

interface AgentMessageCardProps {
  onClose(): void
  onThreadRetry(): void
  threadError: Error | null
  threadId: string | undefined
  threadLoading: boolean
}

export function AgentMessageCard({
  onClose,
  onThreadRetry,
  threadError,
  threadId,
  threadLoading,
}: AgentMessageCardProps) {
  const m = useMessages()
  const queryClient = useQueryClient()
  const olderPageScrollRef = useRef<{ height: number; top: number } | undefined>(undefined)
  const { contentRef, isAtBottom, scrollRef, scrollToBottom, stopScroll } = useStickToBottom({
    initial: 'instant',
    resize: { damping: 0.72, mass: 1.12, stiffness: 0.08 },
  })
  const messagesQuery = useQuery({
    enabled: Boolean(threadId),
    queryFn: () => listChatMessages(threadId ?? ''),
    queryKey: threadId ? chatKeys.messages(threadId) : chatKeys.messages('pending'),
  })
  const messages = messagesQuery.data?.items ?? []
  const nextCursor = messagesQuery.data?.nextCursor
  const loadMoreMutation = useMutation({
    mutationFn: async () => {
      if (!threadId || !nextCursor) {
        return undefined
      }
      return listChatMessages(threadId, { cursor: nextCursor })
    },
    onMutate: () => {
      stopScroll()
      const scroller = scrollRef.current
      olderPageScrollRef.current = scroller
        ? { height: scroller.scrollHeight, top: scroller.scrollTop }
        : undefined
    },
    onSuccess: (response) => {
      if (!threadId || !response) {
        return
      }
      queryClient.setQueryData<AgentChatMessageListCache>(
        chatKeys.messages(threadId),
        (current) => mergeChatHistoryPage(current, response),
      )
      window.requestAnimationFrame(() => {
        const scroller = scrollRef.current
        const previous = olderPageScrollRef.current
        if (!scroller || !previous) {
          return
        }
        scroller.scrollTop = scroller.scrollHeight - previous.height + previous.top
      })
    },
  })
  const retryMessageMutation = useMutation({
    mutationFn: async (messageId: string) => {
      if (!threadId) {
        throw new Error('Chat thread is not ready.')
      }
      return retryChatMessage(threadId, messageId)
    },
    onSuccess: (response) => {
      if (!threadId) {
        return
      }
      queryClient.setQueryData<AgentChatMessageListCache>(
        chatKeys.messages(threadId),
        (current) => upsertChatMessage(current, response.item),
      )
    },
  })

  return (
    <section className="mina-wc-floating-surface grid h-[min(68dvh,44rem)] w-[min(24rem,calc(100vw_-_1.5rem))] grid-rows-[auto_1fr] overflow-hidden rounded-lg border border-border bg-surface-container-lowest text-foreground shadow-floating">
      <header className="flex h-12 min-w-0 items-center justify-between gap-3 border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-7 flex-none place-items-center rounded-lg bg-foreground text-background">
            <span className="h-1.5 w-4 rounded-full bg-background" />
          </span>
          <span className="truncate text-sm font-semibold">{m.workflow_canvas_agent_title()}</span>
        </div>
        <Button
          aria-label={m.workflow_canvas_agent_close()}
          onClick={onClose}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </header>
      <div className="relative min-h-0">
        <div className="h-full min-h-0 overflow-y-auto" ref={scrollRef}>
          <div className="min-h-full px-3 py-3" ref={contentRef}>
            <MessageCardBody
              error={threadError ?? messagesQuery.error ?? loadMoreMutation.error ?? retryMessageMutation.error}
              hasMore={Boolean(nextCursor)}
              isLoading={threadLoading || messagesQuery.isLoading}
              isLoadingMore={loadMoreMutation.isPending}
              messages={messages}
              onLoadMore={() => loadMoreMutation.mutate()}
              onRetry={threadError ? onThreadRetry : () => void messagesQuery.refetch()}
              onRetryAssistantMessage={(messageId) => retryMessageMutation.mutate(messageId)}
              {...(retryMessageMutation.isPending && retryMessageMutation.variables
                ? { retryingMessageId: retryMessageMutation.variables }
                : {})}
            />
          </div>
        </div>
        {!isAtBottom && messages.length > 0 ? (
          <Button
            aria-label={m.workflow_canvas_follow_latest()}
            className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 gap-1.5 rounded-full bg-surface-container-lowest px-3 shadow-floating ring-1 ring-border hover:bg-surface-container-low"
            onClick={() => void scrollToBottom({ animation: 'smooth' })}
            size="xs"
            type="button"
            variant="outline"
          >
            <ArrowDownToLine aria-hidden="true" className="size-3.5" />
            {m.workflow_canvas_follow_latest()}
          </Button>
        ) : null}
      </div>
    </section>
  )
}

function MessageCardBody({
  error,
  hasMore,
  isLoading,
  isLoadingMore,
  messages,
  onLoadMore,
  onRetry,
  onRetryAssistantMessage,
  retryingMessageId,
}: {
  error: Error | null
  hasMore: boolean
  isLoading: boolean
  isLoadingMore: boolean
  messages: NonNullable<AgentChatMessageListCache['items']>
  onLoadMore(): void
  onRetry(): void
  onRetryAssistantMessage(messageId: string): void
  retryingMessageId?: string
}) {
  const m = useMessages()
  if (isLoading) {
    return (
      <div className="grid min-h-40 place-items-center text-foreground-quaternary">
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
      </div>
    )
  }
  if (error && messages.length === 0) {
    return (
      <div className="grid min-h-40 place-items-center gap-2 text-center">
        <div className="max-w-64 text-xs font-medium text-destructive">
          {getErrorMessage(error, m.workflow_canvas_agent_message_failed())}
        </div>
        <Button onClick={onRetry} size="xs" type="button" variant="outline">
          <RefreshCw aria-hidden="true" className="size-3" />
          {m.workflow_canvas_agent_retry()}
        </Button>
      </div>
    )
  }
  if (messages.length === 0) {
    return (
      <div className="grid min-h-40 place-items-center text-xs font-medium text-foreground-quaternary">
        {m.workflow_canvas_agent_empty()}
      </div>
    )
  }
  return (
    <div className="grid gap-3">
      {hasMore ? (
        <Button
          className="justify-self-center"
          disabled={isLoadingMore}
          onClick={onLoadMore}
          size="xs"
          type="button"
          variant="outline"
        >
          {isLoadingMore ? <Loader2 aria-hidden="true" className="size-3 animate-spin" /> : null}
          {m.workflow_canvas_agent_load_older()}
        </Button>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-2.5 py-1.5 text-xs font-medium text-destructive">
          {getErrorMessage(error, m.workflow_canvas_agent_message_failed())}
        </div>
      ) : null}
      <AgentMessageList
        messages={messages}
        onRetryAssistantMessage={onRetryAssistantMessage}
        {...(retryingMessageId ? { retryingMessageId } : {})}
      />
    </div>
  )
}
