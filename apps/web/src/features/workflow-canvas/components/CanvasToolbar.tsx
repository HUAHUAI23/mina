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

const toolbarClassName = 'absolute top-5 left-[22px] z-5 flex items-center gap-1.5 rounded-full bg-surface-container-lowest/85 p-[7px] shadow-floating'
const toolbarButtonClassName = 'flex size-9 items-center justify-center rounded-full border-0 bg-transparent text-foreground-tertiary hover:bg-surface-container-low hover:text-foreground'

export function CanvasToolbar({ onAddNode }: CanvasToolbarProps) {
  return (
    <div className={toolbarClassName} aria-label="Canvas tools">
      {items.map(({ icon: Icon, label, type }) => (
        <button aria-label={`Add ${label}`} className={toolbarButtonClassName} key={type} onClick={() => onAddNode(type)} title={`Add ${label}`} type="button">
          <Icon aria-hidden="true" size={17} />
        </button>
      ))}
    </div>
  )
}
