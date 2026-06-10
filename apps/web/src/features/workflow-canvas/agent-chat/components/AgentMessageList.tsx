import type { ChatMessage } from '@mina/contracts/modules/chat'

import { AgentMessageBubble } from './AgentMessageBubble'

interface AgentMessageListProps {
  messages: ChatMessage[]
  onRetryAssistantMessage?: (messageId: string) => void
  retryingMessageId?: string
}

export function AgentMessageList({
  messages,
  onRetryAssistantMessage,
  retryingMessageId,
}: AgentMessageListProps) {
  return (
    <div className="grid gap-3">
      {messages.map((message) => (
        <AgentMessageBubble
          key={message.id}
          message={message}
          {...(onRetryAssistantMessage ? { onRetryAssistantMessage } : {})}
          {...(retryingMessageId ? { retryingMessageId } : {})}
        />
      ))}
    </div>
  )
}
