import type { ClipboardEvent, DragEvent, KeyboardEvent } from 'react'
import { useRef } from 'react'
import { Badge } from '@mina/ui/components/badge'
import { Button } from '@mina/ui/components/button'
import { Textarea } from '@mina/ui/components/textarea'
import { Paperclip, Send, Slash, X } from 'lucide-react'

import { useMessages } from '../../../../app/i18n-provider'
import { AgentAttachmentChip } from './AgentAttachmentChip'
import { useAgentChatComposer } from './use-agent-chat-composer'

interface AgentChatComposerProps {
  threadId: string | undefined
}

const acceptedUploadTypes = 'image/*,video/*,audio/*,application/pdf,text/*,application/json,application/zip'

export function AgentChatComposer({ threadId }: AgentChatComposerProps) {
  const m = useMessages()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const composer = useAgentChatComposer(threadId)

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      composer.submit()
    }
  }

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = event.clipboardData.files
    if (files.length > 0) {
      composer.attachFiles(files)
    }
  }

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    const files = event.dataTransfer.files
    if (files.length === 0) {
      return
    }
    event.preventDefault()
    composer.attachFiles(files)
  }

  return (
    <section
      className="mina-wc-floating-surface grid w-[min(42rem,calc(100vw_-_2rem))] gap-2 rounded-lg border border-border bg-surface-container-lowest p-2.5 text-foreground shadow-floating"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <header className="flex min-w-0 items-center justify-between gap-2">
        <Badge className="max-w-full truncate" variant="outline">{m.workflow_canvas_agent_title()}</Badge>
        <Button
          aria-label={m.workflow_canvas_agent_close()}
          onClick={composer.closeComposer}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" className="size-3.5" />
        </Button>
      </header>
      {composer.draftAttachments.length > 0 ? (
        <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
          {composer.draftAttachments.map((attachment) => (
            <AgentAttachmentChip
              attachment={attachment}
              key={attachment.id}
              onRemove={() => composer.removeDraftAttachment(attachment.id)}
              onRetry={() => composer.retryAttachment(attachment)}
            />
          ))}
        </div>
      ) : null}
      <Textarea
        aria-label={m.workflow_canvas_agent_input_label()}
        className="max-h-40 min-h-16 resize-none border-0 bg-transparent px-1 py-1 text-sm leading-6 shadow-none focus-visible:ring-0"
        onChange={(event) => composer.setDraftText(event.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={m.workflow_canvas_agent_input_placeholder()}
        value={composer.draftText}
      />
      {composer.visibleError ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-2.5 py-1.5 text-xs font-medium text-destructive">
          {composer.visibleError}
        </div>
      ) : null}
      <footer className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <input
            accept={acceptedUploadTypes}
            className="hidden"
            multiple
            onChange={(event) => {
              if (event.target.files) {
                composer.attachFiles(event.target.files)
              }
              event.target.value = ''
            }}
            ref={fileInputRef}
            type="file"
          />
          <Button
            aria-label={m.workflow_canvas_agent_add_attachment()}
            onClick={() => fileInputRef.current?.click()}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Paperclip aria-hidden="true" className="size-4" />
          </Button>
          <Button
            aria-label={m.workflow_canvas_agent_command()}
            disabled
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Slash aria-hidden="true" className="size-4" />
          </Button>
          <Badge variant="secondary">{m.workflow_canvas_agent_model()}</Badge>
          {composer.hasUploading ? (
            <span className="text-xs text-foreground-quaternary">{m.workflow_canvas_uploading()}</span>
          ) : null}
        </div>
        <Button
          aria-label={m.workflow_canvas_agent_send()}
          disabled={!composer.canSend || composer.sendPending}
          onClick={composer.submit}
          size="icon-sm"
          type="button"
        >
          <Send aria-hidden="true" className="size-4" />
        </Button>
      </footer>
    </section>
  )
}
