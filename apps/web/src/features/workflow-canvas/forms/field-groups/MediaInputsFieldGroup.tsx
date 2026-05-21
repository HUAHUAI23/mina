import type { MediaSlotName, NodeMediaSlotItem } from '@mina/contracts/modules/media'
import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import { MediaSlotList } from '../../components/media-slots/MediaSlotList'

export interface MediaInputsFieldGroupProps {
  node: WorkflowCanvasNode
  onAddUpload(slot: MediaSlotName, file: File): void
  onChange(item: NodeMediaSlotItem): void
  onRemove(slot: MediaSlotName, slotItemId: string): void
  onReplaceUpload(slot: MediaSlotName, slotItemId: string, file: File): void
  onReorder(slot: MediaSlotName, orderedIds: string[]): void
  uploading?: boolean | undefined
}

export function MediaInputsFieldGroup({
  node,
  onAddUpload,
  onChange,
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
      onChange={onChange}
      onRemove={onRemove}
      onReplaceUpload={onReplaceUpload}
      onReorder={onReorder}
    />
  )
}
