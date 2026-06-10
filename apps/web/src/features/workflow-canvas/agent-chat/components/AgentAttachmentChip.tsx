import { FileText, RefreshCw, X } from 'lucide-react'
import { Button } from '@mina/ui/components/button'

import { useMessages } from '../../../../app/i18n-provider'
import { MediaImage } from '../../../../components/media/MediaImage'
import {
  formatAttachmentBytes,
  isImageMimeType,
} from '../domain/chat-attachments'
import type { AgentChatDraftAttachment } from '../store/agent-chat-ui-store'

interface AgentAttachmentChipProps {
  attachment: AgentChatDraftAttachment
  onRemove(): void
  onRetry(): void
}

export function AgentAttachmentChip({ attachment, onRemove, onRetry }: AgentAttachmentChipProps) {
  const m = useMessages()
  const mediaObject = attachment.mediaObject
  const isImage = isImageMimeType(mediaObject?.mimeType ?? attachment.mimeType)
  return (
    <div className="group flex h-16 w-48 flex-none items-center gap-2 rounded-lg border border-border bg-surface-container-low px-2">
      <div className="grid size-11 flex-none place-items-center overflow-hidden rounded-lg bg-surface-container">
        {mediaObject && isImage ? (
          <MediaImage
            alt=""
            className="size-full object-cover"
            source={{ type: 'media', media: { mediaObjectId: mediaObject.id, url: `mina://media/${mediaObject.id}` } }}
          />
        ) : (
          <FileText aria-hidden="true" className="size-5 text-foreground-tertiary" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-semibold">{attachment.fileName}</div>
        <div className="truncate text-xs text-foreground-quaternary">
          {attachment.status === 'error'
            ? attachment.error ?? m.workflow_canvas_agent_upload_failed()
            : attachment.status === 'uploading'
              ? m.workflow_canvas_uploading()
              : formatAttachmentBytes(attachment.size)}
        </div>
      </div>
      {attachment.status === 'error' && attachment.file ? (
        <Button
          aria-label={m.workflow_canvas_agent_retry_attachment()}
          onClick={onRetry}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <RefreshCw aria-hidden="true" className="size-3" />
        </Button>
      ) : null}
      <Button
        aria-label={m.workflow_canvas_agent_remove_attachment()}
        onClick={onRemove}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        <X aria-hidden="true" className="size-3" />
      </Button>
    </div>
  )
}
