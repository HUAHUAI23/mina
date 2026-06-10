import type { ChatMessage, ChatMessagePart } from '@mina/contracts/modules/chat'
import { FileText, Loader2, RefreshCw } from 'lucide-react'
import { Streamdown } from 'streamdown'
import { Button } from '@mina/ui/components/button'

import { useMessages } from '../../../../app/i18n-provider'
import { MediaImage } from '../../../../components/media/MediaImage'
import { mediaObjectContentUrl } from '../../../../lib/media-url'
import { agentMarkdownSecurityProps } from '../domain/agent-markdown-security'
import { formatAttachmentBytes } from '../domain/chat-attachments'
import { getChatErrorMessage } from '../domain/chat-error-message'

interface AgentMessageBubbleProps {
  message: ChatMessage
  onRetryAssistantMessage?: (messageId: string) => void
  retryingMessageId?: string
}

export function AgentMessageBubble({ message, onRetryAssistantMessage, retryingMessageId }: AgentMessageBubbleProps) {
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  return (
    <article className={isUser ? 'ml-8 grid justify-items-end gap-2' : 'mr-8 grid justify-items-start gap-2'}>
      {message.parts.map((part, index) => (
        <AgentMessagePart
          assistant={isAssistant}
          key={`${message.id}:${index}`}
          messageId={message.id}
          {...(onRetryAssistantMessage ? { onRetryAssistantMessage } : {})}
          part={part}
          retrying={retryingMessageId === message.id}
          streaming={message.status === 'streaming'}
          user={isUser}
        />
      ))}
    </article>
  )
}

function AgentMessagePart({
  assistant,
  messageId,
  onRetryAssistantMessage,
  part,
  retrying,
  streaming,
  user,
}: {
  assistant: boolean
  messageId: string
  onRetryAssistantMessage?: (messageId: string) => void
  part: ChatMessagePart
  retrying: boolean
  streaming: boolean
  user: boolean
}) {
  const m = useMessages()
  if (part.type === 'text') {
    if (assistant) {
      return (
        <div className="max-w-full overflow-hidden break-words rounded-2xl rounded-bl-md bg-surface-container-low px-3 py-2 text-sm leading-6 text-foreground">
          <Streamdown
            className="mina-wc-agent-markdown space-y-2"
            controls={{
              code: { copy: true, download: false },
              mermaid: false,
              table: { copy: true, download: false, fullscreen: false },
            }}
            {...agentMarkdownSecurityProps}
            caret="block"
            dir="auto"
            isAnimating={streaming}
            mode={streaming ? 'streaming' : 'static'}
          >
            {part.text}
          </Streamdown>
        </div>
      )
    }
    return (
      <div className={user
        ? 'max-w-full overflow-hidden whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-foreground px-3 py-2 text-sm leading-6 text-background'
        : 'max-w-full overflow-hidden whitespace-pre-wrap break-words rounded-2xl rounded-bl-md bg-surface-container-low px-3 py-2 text-sm leading-6 text-foreground'
      }
      >
        {part.text}
      </div>
    )
  }
  if (part.type === 'image') {
    return (
      <MediaImage
        alt={part.alt ?? ''}
        className="max-h-60 w-full max-w-72 rounded-xl border border-border object-cover"
        source={{ type: 'media', media: { mediaObjectId: part.mediaObjectId, url: `mina://media/${part.mediaObjectId}` } }}
      />
    )
  }
  if (part.type === 'file') {
    return (
      <a
        className="flex w-full max-w-72 items-center gap-2 rounded-xl border border-border bg-surface-container-low px-3 py-2 text-sm text-foreground hover:bg-surface-container"
        href={mediaObjectContentUrl(part.mediaObjectId)}
        rel="noreferrer"
        target="_blank"
      >
        <FileText aria-hidden="true" className="size-4 flex-none text-foreground-tertiary" />
        <span className="min-w-0 flex-1 truncate">{part.name}</span>
        {formatAttachmentBytes(part.byteSize) ? (
          <span className="flex-none text-xs text-foreground-quaternary">{formatAttachmentBytes(part.byteSize)}</span>
        ) : null}
      </a>
    )
  }
  const retryable = part.retryable === true && part.retryState !== 'retrying'
  const showRetrying = retrying || part.retryState === 'retrying'
  return (
    <div className="grid max-w-full gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <div className="flex min-w-0 items-start gap-2">
        {showRetrying ? <Loader2 aria-hidden="true" className="mt-0.5 size-3.5 flex-none animate-spin" /> : null}
        <span className="min-w-0 break-words">{getChatErrorMessage(part, m)}</span>
      </div>
      {retryable && onRetryAssistantMessage ? (
        <Button
          className="h-7 justify-self-start border-destructive/25 px-2 text-destructive hover:bg-destructive/10"
          disabled={retrying}
          onClick={() => onRetryAssistantMessage(messageId)}
          size="xs"
          type="button"
          variant="outline"
        >
          {retrying ? (
            <Loader2 aria-hidden="true" className="size-3 animate-spin" />
          ) : (
            <RefreshCw aria-hidden="true" className="size-3" />
          )}
          {m.workflow_canvas_agent_retry()}
        </Button>
      ) : null}
    </div>
  )
}
