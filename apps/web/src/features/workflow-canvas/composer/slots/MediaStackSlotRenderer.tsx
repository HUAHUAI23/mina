import { Plus } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@mina/ui/components/tooltip'
import { cn } from '@mina/ui/lib/utils'
import {
  DndContext,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragCancelEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { MediaSlotName, NodeMediaSlotItem } from '@mina/contracts/modules/media'

import { useMessages } from '../../../../app/i18n-provider'
import { MediaSlotItem } from '../../components/media-slots/MediaSlotItem'
import type { SlotRendererProps } from '../slot-renderer-registry'

const idsKey = (ids: readonly string[]): string => ids.join('\u0000')
const COLLAPSED_VISIBLE_COUNT = 2
const DRAG_OUTSIDE_DELETE_MARGIN = 120
const slotSectionClassName = 'mina-wc-slot-section flex min-h-[92px] min-w-0 items-center gap-[9px]'
const attachmentSlotSectionClassName = 'pointer-events-auto relative min-h-[calc(var(--composer-media-width)*4/3)] w-max gap-0'
const slotGridClassName = 'mina-wc-slot-grid nodrag nowheel nopan relative flex min-h-[88px] min-w-0 items-center gap-1.5 overflow-visible py-0.5'
const attachmentSlotGridClassName = 'pointer-events-auto min-h-[calc(var(--composer-media-width)*4/3)] w-max gap-0 p-0'
const reorderItemClassName = 'mina-wc-slot-reorder-item flex-none hover:!z-50 focus-within:!z-50'
const attachmentReorderItemClassName = 'pointer-events-auto outline-0 focus-visible:[&_.mina-wc-slot-thumb]:shadow-md focus-visible:[&_.mina-wc-slot-thumb]:ring-2 focus-visible:[&_.mina-wc-slot-thumb]:ring-foreground-secondary/55'
const stackAddClassName = 'mina-wc-stack-add pointer-events-auto relative flex aspect-[3/4] min-h-0 w-full flex-none cursor-pointer items-center justify-center gap-1 overflow-hidden rounded-[12px] border-0 bg-[color-mix(in_oklch,var(--surface-container-lowest)_92%,var(--surface-container-low))] text-foreground-tertiary shadow-sm ring-1 ring-foreground-quaternary/20 hover:bg-[color-mix(in_oklch,var(--surface-container-lowest)_100%,var(--surface-container-low))] hover:text-foreground focus-within:bg-[color-mix(in_oklch,var(--surface-container-lowest)_100%,var(--surface-container-low))] focus-within:text-foreground'
const collapsedStackAddClassName = 'absolute bottom-[4px] left-[calc(var(--composer-media-width)_-_10px)] z-10 m-0 aspect-square size-7 min-h-7 rounded-full border-[1.5px] border-white bg-zinc-200 p-0 text-zinc-900 shadow-sm hover:bg-zinc-200 hover:text-zinc-900 hover:shadow-md focus-within:bg-zinc-200 focus-within:text-zinc-900 focus-within:shadow-md [&_svg]:size-3.5 [&_svg]:stroke-[2.5px]'
const expandedStackAddClassName = 'ml-2.5 h-auto w-(--composer-media-width) origin-center rounded-[12px] border-[1.5px] border-dashed border-[color:rgba(24,24,27,0.15)] bg-zinc-100/80 text-zinc-900 shadow-sm hover:bg-surface-container-high hover:text-foreground focus-within:bg-surface-container-high focus-within:text-foreground'
const emptyStackAddClassName = 'relative z-[1] m-0 h-auto w-(--composer-media-width) rounded-[12px] bg-[color-mix(in_oklch,var(--surface-container-lowest)_92%,var(--surface-container-low))]'
const collapsedEmptyStackAddClassName = 'relative z-[1] m-0 h-auto w-(--composer-media-width) rounded-[10px] border-[1.5px] border-dashed border-[color:rgba(24,24,27,0.18)] bg-zinc-100/80 text-zinc-900 shadow-sm [&_svg]:size-4'
const disabledStackAddClassName = 'pointer-events-none opacity-45'

const itemIdFromUnique = (id: UniqueIdentifier): string => String(id)

const orderedIdsFromVisibleReorder = (
  previousItems: readonly NodeMediaSlotItem[],
  visibleIds: readonly string[],
  nextVisibleIds: readonly string[],
): string[] => {
  const nextVisibleSet = new Set(nextVisibleIds)
  if (nextVisibleIds.length !== visibleIds.length || nextVisibleIds.some((id) => !visibleIds.includes(id))) {
    return previousItems.map((item) => item.id)
  }
  let visibleIndex = 0
  return previousItems.map((item) => (nextVisibleSet.has(item.id) ? nextVisibleIds[visibleIndex++] ?? item.id : item.id))
}

const isPointOutsideElement = (
  element: HTMLElement | undefined,
  point: { x: number; y: number },
  margin: number,
): boolean => {
  if (!element) {
    return false
  }
  const rect = element.getBoundingClientRect()
  return (
    point.x < rect.left - margin ||
    point.x > rect.right + margin ||
    point.y < rect.top - margin ||
    point.y > rect.bottom + margin
  )
}

const pointerOrCenterCollision: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args)
  return pointerCollisions.length > 0 ? pointerCollisions : closestCenter(args)
}

interface DragPoint {
  x: number
  y: number
}

const centerFromDragEvent = (event: DragMoveEvent | DragEndEvent | DragCancelEvent): DragPoint => {
  const activeRect = event.active.rect.current.translated ?? event.active.rect.current.initial
  if (!activeRect) {
    return { x: 0, y: 0 }
  }
  return {
    x: activeRect.left + activeRect.width / 2,
    y: activeRect.top + activeRect.height / 2,
  }
}

const centerFromDragStart = (event: DragStartEvent): DragPoint => {
  const initialRect = event.active.rect.current.initial
  if (!initialRect) {
    return { x: 0, y: 0 }
  }
  return {
    x: initialRect.left + initialRect.width / 2,
    y: initialRect.top + initialRect.height / 2,
  }
}

const orderedVisibleIdsFromDropTarget = (
  visibleIds: readonly string[],
  activeId: string,
  overId: string | undefined,
): string[] => {
  if (!overId || activeId === overId) {
    return [...visibleIds]
  }
  const oldIndex = visibleIds.indexOf(activeId)
  const newIndex = visibleIds.indexOf(overId)
  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
    return [...visibleIds]
  }
  return arrayMove([...visibleIds], oldIndex, newIndex)
}

interface SortableMediaSlotItemProps {
  actions: SlotRendererProps['actions']
  attachment: boolean
  expanded: boolean
  index: number
  item: NodeMediaSlotItem
  itemCount: number
  onKeyboardReorder(nextVisibleIds: string[]): void
  slot: MediaSlotName
  tooltipLabel: string
  visibleIds: readonly string[]
}

function SortableMediaSlotItem({
  actions,
  attachment,
  expanded,
  index,
  item,
  itemCount,
  onKeyboardReorder,
  slot,
  tooltipLabel,
  visibleIds,
}: SortableMediaSlotItemProps) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
  } = useSortable({
    id: item.id,
  })
  // Progressive fan rotation in expanded state, subtle top-left crossed stack when collapsed.
  const rotate = expanded
    ? (index % 2 === 0 ? -8 : 6)
    : ([2.8, -5][index] ?? 0)
  const stackTransform = attachment
    ? expanded
      ? 'rotate(var(--slot-stack-rotate, 0deg))'
      : 'translate(calc(var(--slot-stack-index, 0) * -2px), calc(var(--slot-stack-index, 0) * -1px)) rotate(var(--slot-stack-rotate, 0deg))'
    : undefined
  const style = {
    '--slot-stack-index': index,
    '--slot-stack-total': itemCount,
    '--slot-stack-rotate': `${rotate}deg`,
    marginLeft: attachment && index > 0
      ? expanded
        ? 10
        : 'calc(var(--composer-media-width) * -0.96)'
      : undefined,
    opacity: isDragging ? 0.28 : attachment && !expanded ? 'calc(1 - var(--slot-stack-index, 0) * 0.06)' : 1,
    transform: transform
      ? `${CSS.Transform.toString(transform)} rotate(var(--slot-stack-rotate, 0deg))`
      : stackTransform,
    transformOrigin: attachment ? (expanded ? 'center center' : '86% 76%') : undefined,
    willChange: isDragging ? 'transform' : undefined,
    zIndex: isDragging ? 99 : itemCount - index,
  } as CSSProperties
  const dragHandleProps = {
    ...attributes,
    ...listeners,
    ref: setActivatorNodeRef,
  } as Record<string, unknown>

  const content = (
    <div
      className={cn(reorderItemClassName, attachment && attachmentReorderItemClassName)}
      data-dragging={isDragging ? 'true' : undefined}
      ref={setNodeRef}
      style={style}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
          return
        }
        event.preventDefault()
        const activeIndex = visibleIds.indexOf(item.id)
        const nextIndex = activeIndex + (event.key === 'ArrowLeft' ? -1 : 1)
        if (activeIndex < 0 || nextIndex < 0 || nextIndex >= visibleIds.length) {
          return
        }
        onKeyboardReorder(arrayMove([...visibleIds], activeIndex, nextIndex))
      }}
    >
      <MediaSlotItem
        dragHandleProps={dragHandleProps}
        isFirst={index === 0}
        item={item}
        onRemove={() => actions.onRemove(slot, item.id)}
        showIndex={!attachment || expanded || index === 0}
      />
    </div>
  )

  if (expanded && !isDragging) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {content}
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={8}>
          {tooltipLabel}
        </TooltipContent>
      </Tooltip>
    )
  }

  return content
}

interface DragPreviewProps {
  actions: SlotRendererProps['actions']
  item: NodeMediaSlotItem
  slot: MediaSlotName
}

function DragPreview({ actions, item, slot }: DragPreviewProps) {
  return (
    <div
      className="mina-wc-slot-drag-overlay nodrag nowheel nopan pointer-events-none -rotate-2"
      data-mina-canvas-ignore="true"
      style={{ '--composer-media-width': '60px' } as CSSProperties}
    >
      <MediaSlotItem
        isFirst
        item={item}
        onRemove={() => actions.onRemove(slot, item.id)}
        showRemove={false}
      />
    </div>
  )
}

function DragPreviewPortal({
  actions,
  dragPoint,
  item,
  slot,
}: DragPreviewProps & { dragPoint: DragPoint }) {
  if (typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div
      className="mina-wc-slot-drag-portal pointer-events-none fixed top-0 left-0 z-[1000] -translate-x-1/2 -translate-y-1/2 cursor-grabbing"
      data-mina-canvas-ignore="true"
      style={{
        left: `${dragPoint.x}px`,
        top: `${dragPoint.y}px`,
      }}
    >
      <DragPreview actions={actions} item={item} slot={slot} />
    </div>,
    document.body,
  )
}

export function MediaStackSlotRenderer({
  actions,
  descriptor,
  forceExpanded = false,
  items,
  onExpandedChange,
  variant = 'block',
}: SlotRendererProps) {
  const m = useMessages()
  const [hoveredSlot, setHoveredSlot] = useState<MediaSlotName | undefined>()
  const [focusedSlot, setFocusedSlot] = useState<MediaSlotName | undefined>()
  const [draggingItemId, setDraggingItemId] = useState<string | undefined>()
  const [dragPoint, setDragPoint] = useState<DragPoint | undefined>()
  const [outsideDropTarget, setOutsideDropTarget] = useState(false)
  const collapseTimerRef = useRef<number | undefined>(undefined)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const slotElementRef = useRef<HTMLElement | undefined>(undefined)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )
  const { accept, label, slot } = descriptor
  const full = descriptor.maxItems !== undefined && items.length >= descriptor.maxItems
  const attachment = variant === 'attachment' || variant === 'collapsed'
  const collapsed = variant === 'collapsed'
  const expanded = forceExpanded || hoveredSlot === slot || focusedSlot === slot || Boolean(draggingItemId) || (!attachment && items.length <= 4)
  const visibleItems = expanded ? items : items.slice(0, COLLAPSED_VISIBLE_COUNT)
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const visibleIds = useMemo(() => visibleItems.map((item) => item.id), [visibleItems])
  const activeItem = draggingItemId ? itemsById.get(draggingItemId) : undefined

  const uploadToSlot = (file: File | undefined) => {
    if (file) {
      actions.onAddUpload(slot, file)
    }
  }
  const clearCollapseTimer = () => {
    if (collapseTimerRef.current !== undefined) {
      window.clearTimeout(collapseTimerRef.current)
      collapseTimerRef.current = undefined
    }
  }
  const expandSlot = () => {
    clearCollapseTimer()
    setHoveredSlot(slot)
  }
  const scheduleCollapseSlot = () => {
    clearCollapseTimer()
    collapseTimerRef.current = window.setTimeout(() => {
      setHoveredSlot((current) => (current === slot ? undefined : current))
      collapseTimerRef.current = undefined
    }, 90)
  }

  useEffect(() => clearCollapseTimer, [])
  useEffect(() => {
    onExpandedChange?.(expanded)
  }, [expanded, onExpandedChange])
  const commitVisibleOrder = useCallback((nextVisibleIds: readonly string[]) => {
    if (idsKey(nextVisibleIds) !== idsKey(visibleIds)) {
      actions.onReorder(slot, orderedIdsFromVisibleReorder(items, visibleIds, nextVisibleIds))
    }
  }, [actions, items, slot, visibleIds])
  const updateOutsideState = (event: DragMoveEvent | DragEndEvent | DragCancelEvent) => {
    setOutsideDropTarget(isPointOutsideElement(slotElementRef.current, centerFromDragEvent(event), DRAG_OUTSIDE_DELETE_MARGIN))
  }
  const handleDragStart = (event: DragStartEvent) => {
    setDraggingItemId(itemIdFromUnique(event.active.id))
    setDragPoint(centerFromDragStart(event))
    setOutsideDropTarget(false)
  }
  const handleDragMove = (event: DragMoveEvent) => {
    setDragPoint(centerFromDragEvent(event))
    updateOutsideState(event)
  }
  const handleDragCancel = (event: DragCancelEvent) => {
    updateOutsideState(event)
    setDraggingItemId(undefined)
    setDragPoint(undefined)
    setOutsideDropTarget(false)
  }
  const handleDragEnd = (event: DragEndEvent) => {
    const activeId = itemIdFromUnique(event.active.id)
    const overId = event.over ? itemIdFromUnique(event.over.id) : undefined
    const outside = isPointOutsideElement(slotElementRef.current, centerFromDragEvent(event), DRAG_OUTSIDE_DELETE_MARGIN)
    setDraggingItemId(undefined)
    setDragPoint(undefined)
    setOutsideDropTarget(false)
    if (outside) {
      actions.onRemove(slot, activeId)
      return
    }
    commitVisibleOrder(orderedVisibleIdsFromDropTarget(visibleIds, activeId, overId))
  }

  return (
    <section
      className={cn(slotSectionClassName, attachment && attachmentSlotSectionClassName)}
      data-dragging={draggingItemId ? 'true' : undefined}
      data-expanded={expanded ? 'true' : undefined}
      data-outside-drop={outsideDropTarget ? 'true' : undefined}
      data-variant={variant}
      ref={(element) => {
        slotElementRef.current = element ?? undefined
      }}
      onFocusCapture={(event) => {
        const target = event.target
        if (target instanceof HTMLElement && target.matches(':focus-visible')) {
          setFocusedSlot(slot)
        }
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocusedSlot((current) => (current === slot ? undefined : current))
        }
      }}
    >
      <DndContext
        autoScroll={false}
        collisionDetection={pointerOrCenterCollision}
        measuring={{
          droppable: {
            strategy: MeasuringStrategy.Always,
          },
        }}
        sensors={sensors}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
        onDragMove={handleDragMove}
        onDragStart={handleDragStart}
      >
        <SortableContext items={visibleIds} strategy={horizontalListSortingStrategy}>
          <div
            className={cn(
              slotGridClassName,
              attachment && attachmentSlotGridClassName,
              collapsed && 'h-[62px] max-h-[62px] min-h-[62px]',
              attachment && expanded && !collapsed ? 'py-1.5' : expanded && !collapsed && 'pb-1',
              attachment && outsideDropTarget && 'opacity-[0.64]',
            )}
            data-mina-canvas-ignore="true"
            onMouseEnter={expandSlot}
            onMouseLeave={scheduleCollapseSlot}
          >
            {visibleItems.map((item, index) => (
              <SortableMediaSlotItem
                actions={actions}
                attachment={attachment}
                expanded={expanded}
                index={index}
                item={item}
                itemCount={visibleItems.length}
                key={item.id}
                onKeyboardReorder={commitVisibleOrder}
                slot={slot}
                tooltipLabel={m.workflow_canvas_slot_item({ index: index + 1 })}
                visibleIds={visibleIds}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {activeItem && dragPoint ? (
        <DragPreviewPortal actions={actions} dragPoint={dragPoint} item={activeItem} slot={slot} />
      ) : null}
      <button
        aria-label={m.workflow_canvas_add_slot_item({ label })}
        className={cn(
          stackAddClassName,
          attachment && items.length === 0 && emptyStackAddClassName,
          collapsed && items.length === 0 && collapsedEmptyStackAddClassName,
          attachment && items.length > 0 && !expanded && collapsedStackAddClassName,
          attachment && expanded && expandedStackAddClassName,
          collapsed && items.length > 0 && 'size-7 min-h-7',
          attachment && draggingItemId && 'pointer-events-none opacity-0',
          (actions.uploading || full) && disabledStackAddClassName,
        )}
        data-empty={items.length ? undefined : 'true'}
        data-variant={variant}
        data-uploading={actions.uploading ? 'true' : undefined}
        disabled={actions.uploading || full}
        title={full ? m.workflow_canvas_slot_limit_reached({ label }) : m.workflow_canvas_add_slot_item({ label })}
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          fileInputRef.current?.click()
        }}
        onMouseEnter={expanded ? expandSlot : undefined}
        onMouseLeave={expanded ? scheduleCollapseSlot : undefined}
        onPointerDown={(event) => event.stopPropagation()}
        style={
          expanded
            ? ({
              '--slot-stack-rotate': `${items.length % 2 === 0 ? -8 : 6}deg`,
              transform: 'rotate(var(--slot-stack-rotate, 5deg))',
            } as CSSProperties)
            : attachment && items.length === 0
              ? { transform: 'rotate(-2deg)' }
            : undefined
        }
      >
        <Plus aria-hidden="true" size={18} />
      </button>
      <input
        ref={fileInputRef}
        accept={accept}
        className="hidden"
        disabled={actions.uploading}
        onChange={(event) => {
          uploadToSlot(event.currentTarget.files?.[0])
          event.currentTarget.value = ''
        }}
        type="file"
      />
    </section>
  )
}
