import { Boxes, FileText, Image, Layers, Video } from 'lucide-react'
import type { WorkflowNodeType } from '@mina/contracts/modules/canvas'

interface CanvasToolbarProps {
  onAddNode(type: WorkflowNodeType): void
}

const items: Array<{ icon: typeof Image; label: string; type: WorkflowNodeType }> = [
  { icon: Image, label: 'Image', type: 'image_generation' },
  { icon: Video, label: 'Video', type: 'video_generation' },
  { icon: FileText, label: 'Text', type: 'text' },
  { icon: Boxes, label: 'Flow', type: 'flow_group' },
  { icon: Layers, label: 'Group', type: 'node_group' },
]

export function CanvasToolbar({ onAddNode }: CanvasToolbarProps) {
  return (
    <div className="mina-wc-toolbar" aria-label="Canvas tools">
      {items.map(({ icon: Icon, label, type }) => (
        <button aria-label={`Add ${label}`} key={type} onClick={() => onAddNode(type)} title={`Add ${label}`} type="button">
          <Icon aria-hidden="true" size={17} />
        </button>
      ))}
    </div>
  )
}
