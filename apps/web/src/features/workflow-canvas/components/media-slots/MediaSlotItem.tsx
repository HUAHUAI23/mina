import { FileAudio, GripVertical, ImageOff, Link2, RefreshCcw, Trash2, Video } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CSS } from '@dnd-kit/utilities'
import { useSortable } from '@dnd-kit/sortable'
import type { NodeMediaSlotItem as NodeMediaSlotItemType } from '@mina/contracts/modules/media'

import { SlotOutputSelector } from './SlotOutputSelector'
import { getMediaObject } from '../../api/media-queries'
import { getTask } from '../../api/workflow-queries'
import { mediaKeys, taskKeys } from '../../api/workflow-keys'
import { useCanvasNode } from '../../store/selectors'
import { resolveMediaViewResource } from '../../utils/media-view'
import { previewUrlForMedia } from '../../utils/media-url'

interface MediaSlotItemProps {
  item: NodeMediaSlotItemType
  onChange(item: NodeMediaSlotItemType): void
  onRemove(): void
  onReplace?(file: File): void
}

const isNodeOutput = (
  source: NodeMediaSlotItemType['source'],
): source is Extract<NodeMediaSlotItemType['source'], { type: 'node_output' }> => source.type === 'node_output'

const slotTypeLabel = (item: NodeMediaSlotItemType): string => {
  if (item.source.type === 'media_object') return 'Local upload'
  if (item.source.type === 'external_url') return 'External media'
  if (item.source.resolve === 'run_output') return 'Run output'
  return 'Current MediaView'
}

const mediaFallback = (kind: 'audio' | 'image' | 'video' | undefined) => {
  if (kind === 'video') return <Video size={18} />
  if (kind === 'audio') return <FileAudio size={18} />
  return <Link2 size={18} />
}

export function MediaSlotItem({ item, onChange, onRemove, onReplace }: MediaSlotItemProps) {
  const sortable = useSortable({ id: item.id })
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
  const title =
    item.source.type === 'media_object'
      ? 'Uploaded media'
      : item.source.type === 'external_url'
        ? 'External media'
        : `From ${sourceNode?.data.title ?? nodeOutputSource?.nodeId ?? 'node'}`
  const detail = slotTypeLabel(item)
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
  const style: CSSProperties = {
    cursor: sortable.isDragging ? 'grabbing' : 'grab',
    transform: CSS.Transform.toString(sortable.transform),
    touchAction: 'none',
  }

  return (
    <article
      className="mina-wc-slot-item nodrag nowheel nopan"
      data-mina-canvas-ignore="true"
      data-dragging={sortable.isDragging ? 'true' : undefined}
      data-missing={hasUpstreamMedia ? undefined : 'true'}
      ref={sortable.setNodeRef}
      style={style}
    >
      <div
        className="mina-wc-slot-thumb"
        ref={sortable.setActivatorNodeRef}
        {...sortable.attributes}
        {...sortable.listeners}
      >
        {localPreview ? (
          <img alt="" src={localPreview} />
        ) : hasUpstreamMedia ? (
          mediaFallback(mediaKind)
        ) : (
          <ImageOff size={18} />
        )}
        <span>{item.order + 1}</span>
        <div aria-hidden="true" className="mina-wc-slot-drag-affordance">
          <GripVertical size={13} />
        </div>
      </div>
      <div className="mina-wc-slot-copy">
        <strong>{title}</strong>
        <span>{hasUpstreamMedia ? detail : 'No upstream output'}</span>
        <SlotOutputSelector item={item} onChange={onChange} />
      </div>
      <div className="mina-wc-slot-actions">
        {item.source.type === 'media_object' && onReplace ? (
          <label aria-label="Replace media" title="Replace media">
            <RefreshCcw aria-hidden="true" size={14} />
            <input
              accept="image/*,video/*,audio/*"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                if (file) {
                  onReplace(file)
                  event.currentTarget.value = ''
                }
              }}
              type="file"
            />
          </label>
        ) : null}
        <button aria-label="Remove slot item" onClick={onRemove} type="button">
          <Trash2 aria-hidden="true" size={14} />
        </button>
      </div>
    </article>
  )
}
