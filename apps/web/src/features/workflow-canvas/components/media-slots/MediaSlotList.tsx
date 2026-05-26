import { type ClipboardEvent, type DragEvent, useMemo, useState } from 'react'
import type { MediaSlotName, NodeMediaSlotItem } from '@mina/contracts/modules/media'
import type { NodeMediaSlots } from '@mina/contracts/modules/media'
import type { WorkflowNodeType } from '@mina/contracts/modules/canvas'
import { cn } from '@mina/ui/lib/utils'

import {
  defaultMediaSlotForNodeType,
  type MediaSlotDescriptor,
  mediaSlotsForNodeType,
} from '../../domain/media-slot-policy'
import { slotRendererRegistry, type SlotRendererActions } from '../../composer/slot-renderer-registry'
import type { ClientModelSpec } from '../../forms/registry/client-model-registry'
import { useCanvasUiStore } from '../../store/canvas-ui-store'

interface MediaSlotListProps {
  actions?: SlotRendererActions | undefined
  composerId: string
  forceExpanded?: boolean | undefined
  mediaSlots: NodeMediaSlots
  modelSpec?: ClientModelSpec | undefined
  nodeType: Extract<WorkflowNodeType, 'image_generation' | 'video_generation'>
  onAddUpload?: ((slot: MediaSlotName, file: File, options?: { position?: 'end' | 'start' }) => void) | undefined
  onChange?: ((item: NodeMediaSlotItem) => void) | undefined
  onRemove?: ((slot: MediaSlotName, slotItemId: string) => void) | undefined
  onReplaceUpload?: ((slot: MediaSlotName, slotItemId: string, file: File) => void) | undefined
  onReorder?: ((slot: MediaSlotName, orderedIds: string[]) => void) | undefined
  uploading?: boolean | undefined
  variant?: 'attachment' | 'block' | 'collapsed'
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

const slotHasRoom = (mediaSlots: NodeMediaSlots | undefined, descriptor: MediaSlotDescriptor): boolean =>
  descriptor.maxItems === undefined || slotItemCount(mediaSlots, descriptor.slot) < descriptor.maxItems

const slotListClassName = 'mina-wc-slot-list nodrag nowheel nopan grid min-w-0 items-start gap-2 outline-0'
const attachmentSlotListClassName = 'max-w-[min(520px,calc(100vw_-_72px))] overflow-visible pointer-events-none'
const collapsedSlotListClassName = 'w-auto overflow-visible pointer-events-auto [--composer-media-width:46px]'
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
  actions: actionsProp,
  composerId,
  forceExpanded,
  mediaSlots,
  modelSpec,
  nodeType,
  onAddUpload,
  onChange,
  onRemove,
  onReplaceUpload,
  onReorder,
  uploading,
  variant = 'block',
}: MediaSlotListProps) {
  const slotPolicy = mediaSlotsForNodeType(nodeType, modelSpec?.mediaCapabilities)
  const defaultSlot = defaultMediaSlotForNodeType(nodeType, modelSpec?.mediaCapabilities)
  const selectedSlot = useCanvasUiStore((state) => state.selectedSlotByComposerId[composerId])
  const setSelectedSlot = useCanvasUiStore((state) => state.setComposerSelectedSlot)
  const [expandedSlot, setExpandedSlot] = useState<MediaSlotName | undefined>()
  const activeSlot = preferredActiveSlot(slotPolicy, mediaSlots, selectedSlot, defaultSlot)
  const activeDescriptor = slotPolicy.find((descriptor) => descriptor.slot === activeSlot) ?? slotPolicy[0]
  const uploadDescriptor = activeDescriptor && slotHasRoom(mediaSlots, activeDescriptor)
    ? activeDescriptor
    : slotPolicy.find((descriptor) => slotHasRoom(mediaSlots, descriptor))
  const actions = useMemo<SlotRendererActions>(
    () => actionsProp ?? {
      ...(uploading !== undefined ? { uploading } : {}),
      onAddUpload: onAddUpload ?? (() => undefined),
      onChange: onChange ?? (() => undefined),
      onRemove: onRemove ?? (() => undefined),
      onReplaceUpload: onReplaceUpload ?? (() => undefined),
      onReorder: onReorder ?? (() => undefined),
    },
    [actionsProp, onAddUpload, onChange, onRemove, onReplaceUpload, onReorder, uploading],
  )
  if (!activeDescriptor) {
    return null
  }
  const renderer = slotRendererRegistry.resolve({ descriptor: activeDescriptor, nodeType })
  const SlotRenderer = renderer.Component

  return (
    <div
      className={cn(
        slotListClassName,
        variant === 'attachment' && attachmentSlotListClassName,
        variant === 'collapsed' && collapsedSlotListClassName,
      )}
      data-mina-canvas-ignore="true"
      data-expanded={expandedSlot ? 'true' : undefined}
      data-variant={variant}
      tabIndex={0}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
      onDrop={(event) => {
        const file = firstDroppedFile(event)
        if (!file || !uploadDescriptor) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        actions.onAddUpload(uploadDescriptor.slot, file, { position: 'start' })
      }}
      onPaste={(event) => {
        const file = firstPastedFile(event)
        if (!file || !uploadDescriptor) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        actions.onAddUpload(uploadDescriptor.slot, file, { position: 'start' })
      }}
    >
      {slotPolicy.length > 1 ? (
        <div
          className={cn(
            slotTabsClassName,
            (variant === 'attachment' || variant === 'collapsed') && attachmentSlotTabsClassName,
            variant === 'attachment' && !expandedSlot && 'hidden',
            variant === 'collapsed' && 'hidden',
          )}
          role="tablist"
          aria-label="Media slot"
        >
          {slotPolicy.map((descriptor) => (
            <button
              aria-selected={descriptor.slot === activeDescriptor.slot}
              className={cn(slotTabClassName, (variant === 'attachment' || variant === 'collapsed') && attachmentSlotTabClassName)}
              key={descriptor.slot}
              onClick={() => setSelectedSlot(composerId, descriptor.slot)}
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
        nodeType={nodeType}
        onExpandedChange={(expanded) => setExpandedSlot(expanded ? activeDescriptor.slot : undefined)}
        variant={variant}
      />
    </div>
  )
}
