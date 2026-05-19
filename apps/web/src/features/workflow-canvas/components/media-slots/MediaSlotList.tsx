import { Clipboard, ImagePlus } from 'lucide-react'
import { useState, type ClipboardEvent } from 'react'
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { horizontalListSortingStrategy, SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import type { MediaSlotName, NodeMediaSlotItem } from '@mina/contracts/modules/media'
import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import { LocalMediaUploader } from './LocalMediaUploader'
import { MediaSlotItem } from './MediaSlotItem'
import { isMediaGenerationNode } from '../../domain/canvas-node-types'
import {
  defaultMediaSlotForNodeType,
  mediaSlotsForNodeType,
} from '../../domain/media-slot-policy'

interface MediaSlotListProps {
  node: WorkflowCanvasNode
  onAddUpload(slot: MediaSlotName, file: File): void
  onChange(item: NodeMediaSlotItem): void
  onRemove(slot: MediaSlotName, slotItemId: string): void
  onReplaceUpload(slot: MediaSlotName, slotItemId: string, file: File): void
  onReorder(slot: MediaSlotName, orderedIds: string[]): void
  uploading?: boolean
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

export function MediaSlotList({
  node,
  onAddUpload,
  onChange,
  onRemove,
  onReplaceUpload,
  onReorder,
  uploading,
}: MediaSlotListProps) {
  const [activeDragItem, setActiveDragItem] = useState<NodeMediaSlotItem | undefined>()
  if (!isMediaGenerationNode(node)) {
    return null
  }
  const mediaSlots = node.data.mediaSlots ?? {}
  const slotPolicy = mediaSlotsForNodeType(node.data.nodeType)
  const defaultSlot = defaultMediaSlotForNodeType(node.data.nodeType)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const handleDragStart = (items: NodeMediaSlotItem[]) => (event: DragStartEvent) => {
    setActiveDragItem(items.find((item) => item.id === event.active.id))
  }
  const handleDragEnd = (slot: MediaSlotName, items: NodeMediaSlotItem[]) => (event: DragEndEvent) => {
    setActiveDragItem(undefined)
    if (!event.over || event.active.id === event.over.id) {
      return
    }
    const activeIndex = items.findIndex((item) => item.id === event.active.id)
    const overIndex = items.findIndex((item) => item.id === event.over?.id)
    if (activeIndex < 0 || overIndex < 0) {
      return
    }
    const ordered = [...items]
    const [moved] = ordered.splice(activeIndex, 1)
    if (!moved) {
      return
    }
    ordered.splice(overIndex, 0, moved)
    onReorder(slot, ordered.map((item) => item.id))
  }
  const handleDragCancel = () => {
    setActiveDragItem(undefined)
  }
  return (
    <div
      className="mina-wc-slot-list nodrag nowheel nopan"
      data-mina-canvas-ignore="true"
      tabIndex={0}
      onPaste={(event) => {
        const file = firstPastedFile(event)
        if (!file) {
          return
        }
        event.preventDefault()
        if (defaultSlot) {
          onAddUpload(defaultSlot, file)
        }
      }}
    >
      {slotPolicy.map(({ accept, label, slot }) => {
        const items: NodeMediaSlotItem[] = mediaSlots[slot] ?? []
        return (
          <section className="mina-wc-slot-section" key={slot}>
            <DndContext
              collisionDetection={closestCenter}
              measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
              onDragCancel={handleDragCancel}
              onDragEnd={handleDragEnd(slot, items)}
              onDragStart={handleDragStart(items)}
              sensors={sensors}
            >
              <SortableContext items={items.map((item) => item.id)} strategy={horizontalListSortingStrategy}>
                <div className="mina-wc-slot-grid nodrag nowheel nopan" data-mina-canvas-ignore="true">
                  {items.map((item) => (
                    <MediaSlotItem
                      item={item}
                      key={item.id}
                      onChange={onChange}
                      onRemove={() => onRemove(slot, item.id)}
                      onReplace={(file) => onReplaceUpload(slot, item.id, file)}
                    />
                  ))}
                  <LocalMediaUploader
                    accept={accept}
                    ariaLabel={`Add ${label}`}
                    className="mina-wc-slot-drop"
                    disabled={uploading}
                    onUpload={(file) => onAddUpload(slot, file)}
                  >
                    <ImagePlus aria-hidden="true" size={18} />
                    <Clipboard aria-hidden="true" size={14} />
                  </LocalMediaUploader>
                </div>
              </SortableContext>
              <DragOverlay dropAnimation={null}>
                {activeDragItem && items.some((item) => item.id === activeDragItem.id) ? (
                  <div className="mina-wc-slot-drag-overlay" data-missing={undefined}>
                    <span>{activeDragItem.order + 1}</span>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </section>
        )
      })}
    </div>
  )
}
