import type { MediaSlotName, NodeMediaSlotItem } from '@mina/contracts/modules/media'
import type { NodeMediaSlots } from '@mina/contracts/modules/media'
import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import { MediaSlotList } from '../../components/media-slots/MediaSlotList'

interface MediaInputsFieldGroupProps {
  mediaSlots: NodeMediaSlots
  node: WorkflowCanvasNode
  onAddUpload(slot: MediaSlotName, file: File): void
  onChange(item: NodeMediaSlotItem): void
  onMediaSlotsChange(mediaSlots: NodeMediaSlots): void
  onRemove(slot: MediaSlotName, slotItemId: string): void
  onReplaceUpload(slot: MediaSlotName, slotItemId: string, file: File): void
  onReorder(slot: MediaSlotName, orderedIds: string[]): void
  uploading?: boolean | undefined
}

export function MediaInputsFieldGroup({
  mediaSlots,
  node,
  onAddUpload,
  onChange,
  onMediaSlotsChange,
  onRemove,
  onReplaceUpload,
  onReorder,
  uploading,
}: MediaInputsFieldGroupProps) {
  return (
    <MediaSlotList
      node={node}
      {...(uploading !== undefined ? { uploading } : {})}
      onAddUpload={onAddUpload}
      onChange={(item) => {
        const items = mediaSlots[item.slot] ?? []
        onMediaSlotsChange({
          ...mediaSlots,
          [item.slot]: items.map((candidate) => (candidate.id === item.id ? item : candidate)),
        })
        onChange(item)
      }}
      onRemove={onRemove}
      onReplaceUpload={onReplaceUpload}
      onReorder={(slot, orderedIds) => {
        const items = mediaSlots[slot] ?? []
        const byId = new Map(items.map((item) => [item.id, item]))
        const orderedItems = orderedIds
          .map((id) => byId.get(id))
          .filter((item): item is NodeMediaSlotItem => Boolean(item))
        const orderedSet = new Set(orderedIds)
        const remainingItems = items.filter((item) => !orderedSet.has(item.id))
        onMediaSlotsChange({
          ...mediaSlots,
          [slot]: [...orderedItems, ...remainingItems].map((item, order) => ({ ...item, order })),
        })
        onReorder(slot, orderedIds)
      }}
    />
  )
}
