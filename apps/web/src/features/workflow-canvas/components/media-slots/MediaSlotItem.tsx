import { FileAudio, ImageOff, Link2, Video, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import type { NodeMediaSlotItem as NodeMediaSlotItemType } from '@mina/contracts/modules/media'
import { cn } from '@mina/ui/lib/utils'

import { useMessages } from '../../../../app/i18n-provider'
import { getMediaObject } from '../../api/media-queries'
import { getTask } from '../../api/workflow-queries'
import { mediaKeys, taskKeys } from '../../api/workflow-keys'
import { useCanvasNode } from '../../store/selectors'
import { resolveMediaViewResource } from '../../utils/media-view'
import { previewUrlForMedia } from '../../utils/media-url'

interface MediaSlotItemProps {
  dragHandleProps?: Record<string, unknown> | undefined
  isFirst?: boolean
  item: NodeMediaSlotItemType
  onRemove(): void
  showIndex?: boolean | undefined
  showRemove?: boolean | undefined
}

const isNodeOutput = (
  source: NodeMediaSlotItemType['source'],
): source is Extract<NodeMediaSlotItemType['source'], { type: 'node_output' }> => source.type === 'node_output'

const mediaFallback = (kind: 'audio' | 'image' | 'video' | undefined) => {
  if (kind === 'video') return <Video size={14} />
  if (kind === 'audio') return <FileAudio size={14} />
  return <Link2 size={14} />
}

const slotItemClassName = 'mina-wc-slot-item group relative block w-(--composer-media-width) select-none rounded-[12px] bg-transparent touch-none hover:z-30 active:cursor-grabbing cursor-grab nodrag nowheel nopan'
const slotThumbClassName = 'mina-wc-slot-thumb relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-[12px] bg-surface-container-high text-foreground-quaternary shadow-[0_0_0_1.5px_#ffffff,0_8px_16px_-8px_rgba(0,0,0,0.25),0_3px_6px_-3px_rgba(0,0,0,0.15)]'
const missingSlotThumbClassName = 'shadow-[inset_0_0_0_1.5px_color-mix(in_oklch,var(--destructive)_42%,transparent)]'
const slotIndexClassName = 'mina-wc-slot-index absolute top-1 left-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--foreground)_72%,transparent)] px-[3px] text-[0.52rem] font-[850] text-primary-foreground'
const slotCloseClassName = 'mina-wc-slot-close pointer-events-none absolute -top-1.5 -right-1.5 z-40 flex size-4.5 cursor-pointer items-center justify-center rounded-full bg-zinc-900 p-0 text-white opacity-0 hover:bg-black group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 [&_svg]:size-2.5 [&_svg]:stroke-[2.5px]'
const slotImageClassName = 'size-full object-cover'

export function MediaSlotItem({
  dragHandleProps,
  isFirst,
  item,
  onRemove,
  showIndex = true,
  showRemove = true,
}: MediaSlotItemProps) {
  const m = useMessages()
  const nodeOutputSource = isNodeOutput(item.source) ? item.source : undefined
  const sourceNode = useCanvasNode(nodeOutputSource?.nodeId ?? '')
  const sourceMediaView =
    sourceNode?.data.nodeType === 'image_generation' || sourceNode?.data.nodeType === 'video_generation'
      ? sourceNode.data.mediaView
      : undefined
  const hasUpstreamMedia = item.source.type === 'node_output' ? Boolean(sourceMediaView?.taskId) : true
  const mediaObjectId = item.source.type === 'media_object' ? item.source.mediaObjectId : undefined
  const mediaQuery = useQuery({
    enabled: Boolean(mediaObjectId),
    queryFn: () => getMediaObject(mediaObjectId ?? ''),
    queryKey: mediaObjectId ? mediaKeys.detail(mediaObjectId) : mediaKeys.detail('pending'),
    staleTime: 30_000,
  })
  const taskQuery = useQuery({
    enabled: Boolean(sourceMediaView?.taskId),
    queryFn: () => getTask(sourceMediaView?.taskId ?? ''),
    queryKey: sourceMediaView?.taskId ? taskKeys.detail(sourceMediaView.taskId) : taskKeys.detail('pending'),
    staleTime: 10_000,
  })
  const upstreamResource = resolveMediaViewResource(taskQuery.data?.item.output, sourceMediaView)
  const localPreview =
    item.source.type === 'external_url' && item.source.kind === 'image'
      ? previewUrlForMedia(item.source)
      : mediaQuery.data?.item.kind === 'image'
        ? previewUrlForMedia({ mediaObjectId: mediaQuery.data.item.id, url: mediaQuery.data.item.url })
        : upstreamResource?.kind === 'image'
          ? previewUrlForMedia(upstreamResource)
          : undefined
  const mediaKind =
    item.source.type === 'external_url' ? item.source.kind : mediaQuery.data?.item.kind ?? upstreamResource?.kind

  return (
    <article
      {...dragHandleProps}
      className={slotItemClassName}
      data-first={isFirst ? 'true' : undefined}
      data-mina-canvas-ignore="true"
      data-missing={hasUpstreamMedia ? undefined : 'true'}
      title={m.workflow_canvas_drag_to_reorder()}
    >
      <div className={cn(slotThumbClassName, !hasUpstreamMedia && missingSlotThumbClassName)}>
        {localPreview ? (
          <img alt="" className={slotImageClassName} draggable={false} src={localPreview} />
        ) : hasUpstreamMedia ? (
          mediaFallback(mediaKind)
        ) : (
          <ImageOff size={14} />
        )}
        {showIndex ? <span className={slotIndexClassName}>{item.order + 1}</span> : null}
      </div>
      {showRemove ? (
        <button
          aria-label={m.workflow_canvas_remove()}
          className={slotCloseClassName}
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >
          <X aria-hidden="true" size={10} />
        </button>
      ) : null}
    </article>
  )
}
