import type { MediaSlotName, NodeMediaSlotItem } from '@mina/contracts/modules/media'
import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import { LocalMediaUploader } from './LocalMediaUploader'
import { MediaSlotItem } from './MediaSlotItem'

const slotLabels: Array<{ label: string; slot: MediaSlotName }> = [
  { label: 'Input images', slot: 'inputImages' },
  { label: 'First frame', slot: 'firstFrame' },
  { label: 'Last frame', slot: 'lastFrame' },
  { label: 'Reference images', slot: 'referenceImages' },
  { label: 'Reference audio', slot: 'referenceAudios' },
  { label: 'Reference videos', slot: 'referenceVideos' },
]

interface MediaSlotListProps {
  node: WorkflowCanvasNode
  nodes: WorkflowCanvasNode[]
  onAddUpload(slot: MediaSlotName, file: File): void
  onChange(item: NodeMediaSlotItem): void
  onMove(slot: MediaSlotName, slotItemId: string, direction: -1 | 1): void
  onRemove(slot: MediaSlotName, slotItemId: string): void
  uploading?: boolean
}

export function MediaSlotList({ node, nodes, onAddUpload, onChange, onMove, onRemove, uploading }: MediaSlotListProps) {
  if (node.data.nodeType !== 'image_generation' && node.data.nodeType !== 'video_generation') {
    return null
  }
  const mediaSlots = node.data.mediaSlots ?? {}
  return (
    <div className="mina-wc-slot-list">
      {slotLabels.map(({ label, slot }) => {
        const items: NodeMediaSlotItem[] = mediaSlots[slot] ?? []
        const showSlot = items.length > 0 || slot === 'inputImages' || slot === 'firstFrame'
        if (!showSlot) {
          return null
        }
        return (
          <section className="mina-wc-slot-section" key={slot}>
            <div className="mina-wc-slot-heading">
              <span>{label}</span>
              <LocalMediaUploader disabled={uploading} onUpload={(file) => onAddUpload(slot, file)} />
            </div>
            {items.length > 0 ? (
              items.map((item) => (
                <MediaSlotItem
                  item={item}
                  key={item.id}
                  nodes={nodes}
                  onChange={onChange}
                  onMove={(direction) => onMove(slot, item.id, direction)}
                  onRemove={() => onRemove(slot, item.id)}
                />
              ))
            ) : (
              <div className="mina-wc-slot-empty">No media linked</div>
            )}
          </section>
        )
      })}
    </div>
  )
}
