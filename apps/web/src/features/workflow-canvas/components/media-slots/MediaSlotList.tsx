import { type ClipboardEvent, type DragEvent, useMemo, useState } from 'react'
import type { MediaSlotName, NodeMediaSlotItem } from '@mina/contracts/modules/media'
import type { NodeMediaSlots } from '@mina/contracts/modules/media'
import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import { cn } from '@mina/ui/lib/utils'

import { isMediaGenerationNode } from '../../domain/canvas-node-types'
import {
  defaultMediaSlotForNodeType,
  type MediaSlotDescriptor,
  mediaSlotsForNodeType,
} from '../../domain/media-slot-policy'
import { slotRendererRegistry, type SlotRendererActions } from '../../composer/slot-renderer-registry'
import '../../composer/slots'

interface MediaSlotListProps {
  forceExpanded?: boolean | undefined
  node: WorkflowCanvasNode
  onAddUpload(slot: MediaSlotName, file: File, options?: { position?: 'end' | 'start' }): void
  onChange(item: NodeMediaSlotItem): void
  onRemove(slot: MediaSlotName, slotItemId: string): void
  onReplaceUpload(slot: MediaSlotName, slotItemId: string, file: File): void
  onReorder(slot: MediaSlotName, orderedIds: string[]): void
  uploading?: boolean
  variant?: 'attachment' | 'block'
}

const firstPastedFile = (event: ClipboardEvent<HTMLElement>): File | undefined => {
  for (const item of Array.from(event.clipboardData.items)) {
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file) {
        return file
      }
    }
  }
  return undefined
}

const firstDroppedFile = (event: DragEvent<HTMLElement>): File | undefined =>
  Array.from(event.dataTransfer.files).find((file) => file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('audio/'))

const slotItemCount = (mediaSlots: NodeMediaSlots | undefined, slot: MediaSlotName): number =>
  mediaSlots?.[slot]?.length ?? 0

const slotListClassName = 'mina-wc-slot-list nodrag nowheel nopan grid min-w-0 items-start gap-2 outline-0'
const attachmentSlotListClassName = 'max-w-[min(520px,calc(100vw_-_72px))] overflow-visible pointer-events-none'
const slotTabsClassName = 'mina-wc-slot-tabs flex min-w-0 items-center gap-1.5 overflow-x-auto pb-0.5'
const attachmentSlotTabsClassName = 'pointer-events-auto -mt-3 mb-[5px] max-w-max rounded-full bg-[color-mix(in_oklch,var(--surface-container-lowest)_88%,transparent)] p-[3px] shadow-[0_12px_26px_-22px_color-mix(in_oklch,var(--foreground)_24%,transparent)]'
const slotTabClassName = 'mina-wc-slot-tab group inline-flex min-h-[30px] flex-none items-center gap-1.5 rounded-full border-0 bg-transparent px-[9px] text-[0.72rem] font-extrabold text-foreground-tertiary hover:bg-surface-container-low hover:text-foreground aria-selected:bg-surface-container-low aria-selected:text-foreground'
const attachmentSlotTabClassName = 'min-h-6 px-[7px] text-[0.66rem]'
const slotCountClassName = 'flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--foreground-quaternary)_12%,transparent)] px-[5px] text-[0.62rem] text-foreground-tertiary group-aria-selected:bg-foreground group-aria-selected:text-primary-foreground'

const preferredActiveSlot = (
  descriptors: readonly MediaSlotDescriptor[],
  mediaSlots: NodeMediaSlots | undefined,
  currentSlot: MediaSlotName | undefined,
  fallbackSlot: MediaSlotName | undefined,
): MediaSlotName | undefined => {
  if (currentSlot && descriptors.some((descriptor) => descriptor.slot === currentSlot)) {
    return currentSlot
  }
  const firstFilledSlot = descriptors.find((descriptor) => slotItemCount(mediaSlots, descriptor.slot) > 0)?.slot
  return firstFilledSlot ?? fallbackSlot
}

export function MediaSlotList({
  forceExpanded,
  node,
  onAddUpload,
  onChange,
  onRemove,
  onReplaceUpload,
  onReorder,
  uploading,
  variant = 'block',
}: MediaSlotListProps) {
  if (!isMediaGenerationNode(node)) {
    return null
  }
  const mediaSlots = node.data.mediaSlots ?? {}
  const slotPolicy = mediaSlotsForNodeType(node.data.nodeType)
  const defaultSlot = defaultMediaSlotForNodeType(node.data.nodeType)
  const [expandedSlot, setExpandedSlot] = useState<MediaSlotName | undefined>()
  const [selectedSlot, setSelectedSlot] = useState<MediaSlotName | undefined>(defaultSlot)
  const activeSlot = preferredActiveSlot(slotPolicy, mediaSlots, selectedSlot, defaultSlot)
  const activeDescriptor = slotPolicy.find((descriptor) => descriptor.slot === activeSlot) ?? slotPolicy[0]
  const actions = useMemo<SlotRendererActions>(
    () => ({
      ...(uploading !== undefined ? { uploading } : {}),
      onAddUpload,
      onChange,
      onRemove,
      onReplaceUpload,
      onReorder,
    }),
    [onAddUpload, onChange, onRemove, onReplaceUpload, onReorder, uploading],
  )
  if (!activeDescriptor) {
    return null
  }
  const renderer = slotRendererRegistry.resolve({ descriptor: activeDescriptor, node })
  const SlotRenderer = renderer.Component

  return (
    <div
      className={cn(slotListClassName, variant === 'attachment' && attachmentSlotListClassName)}
      data-mina-canvas-ignore="true"
      data-expanded={expandedSlot ? 'true' : undefined}
      data-variant={variant}
      tabIndex={0}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault()
        }
      }}
      onDrop={(event) => {
        const file = firstDroppedFile(event)
        if (!file || !defaultSlot) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        onAddUpload(defaultSlot, file)
      }}
      onPaste={(event) => {
        const file = firstPastedFile(event)
        if (!file || !defaultSlot) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        onAddUpload(defaultSlot, file, { position: 'start' })
      }}
    >
      {slotPolicy.length > 1 ? (
        <div
          className={cn(
            slotTabsClassName,
            variant === 'attachment' && attachmentSlotTabsClassName,
            variant === 'attachment' && !expandedSlot && 'hidden',
          )}
          role="tablist"
          aria-label="Media slot"
        >
          {slotPolicy.map((descriptor) => (
            <button
              aria-selected={descriptor.slot === activeDescriptor.slot}
              className={cn(slotTabClassName, variant === 'attachment' && attachmentSlotTabClassName)}
              key={descriptor.slot}
              onClick={() => setSelectedSlot(descriptor.slot)}
              role="tab"
              type="button"
            >
              <span>{descriptor.label}</span>
              <strong className={slotCountClassName}>{slotItemCount(mediaSlots, descriptor.slot)}</strong>
            </button>
          ))}
        </div>
      ) : null}
      <SlotRenderer
        actions={actions}
        descriptor={activeDescriptor}
        forceExpanded={forceExpanded}
        items={mediaSlots[activeDescriptor.slot] ?? []}
        key={activeDescriptor.slot}
        node={node}
        onExpandedChange={(expanded) => setExpandedSlot(expanded ? activeDescriptor.slot : undefined)}
        variant={variant}
      />
    </div>
  )
}
