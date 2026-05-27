import { X } from 'lucide-react'
import type { ComponentType } from 'react'
import type { MediaSlotName, NodeMediaSlotItem } from '@mina/contracts/modules/media'
import type { WorkflowNodeType } from '@mina/contracts/modules/canvas'

import { useMessages } from '../../../app/i18n-provider'
import type { MediaSlotDescriptor } from '../domain/media-slot-policy'

export interface SlotRendererActions {
  onAddUpload(slot: MediaSlotName, file: File, options?: { position?: 'end' | 'start' }): void
  onChange(item: NodeMediaSlotItem): void
  onRemove(slot: MediaSlotName, slotItemId: string): void
  onReplaceUpload(slot: MediaSlotName, slotItemId: string, file: File): void
  onReorder(slot: MediaSlotName, orderedIds: string[]): void
  uploading?: boolean | undefined
}

export interface SlotRendererProps {
  actions: SlotRendererActions
  descriptor: MediaSlotDescriptor
  forceExpanded?: boolean | undefined
  items: NodeMediaSlotItem[]
  nodeType: Extract<WorkflowNodeType, 'image_generation' | 'video_generation'>
  onExpandedChange?: ((expanded: boolean) => void) | undefined
  variant?: 'attachment' | 'block' | 'collapsed'
}

export interface SlotRendererSpec {
  Component: ComponentType<SlotRendererProps>
  id: string
  match(input: { descriptor: MediaSlotDescriptor; nodeType: Extract<WorkflowNodeType, 'image_generation' | 'video_generation'> }): boolean
  priority: number
}

class SlotRendererRegistry {
  private specs: SlotRendererSpec[] = []

  register(spec: SlotRendererSpec): void {
    if (this.specs.some((candidate) => candidate.id === spec.id)) {
      return
    }
    this.specs.push(spec)
  }

  resolve(input: { descriptor: MediaSlotDescriptor; nodeType: Extract<WorkflowNodeType, 'image_generation' | 'video_generation'> }): SlotRendererSpec {
    const [spec] = this.specs
      .filter((candidate) => candidate.match(input))
      .sort((left, right) => left.priority - right.priority)
    if (!spec) {
      if (import.meta.env.DEV) {
        console.warn(`No slot renderer registered for ${input.descriptor.slot}; using fallback renderer.`)
      }
      return fallbackSlotRendererSpec
    }
    return spec
  }
}

const fallbackSlotRendererClassName = 'grid min-h-[88px] min-w-0 gap-1.5 rounded-lg bg-surface-container-high p-2'
const fallbackItemClassName = 'flex min-w-0 items-center justify-between gap-2 rounded-md bg-surface-container-lowest px-2 py-1.5 text-[0.74rem] font-bold text-foreground-tertiary'
const fallbackButtonClassName = 'flex size-7 flex-none items-center justify-center rounded-md border-0 bg-transparent text-foreground-tertiary hover:bg-surface-container-low hover:text-foreground'

function FallbackSlotRenderer({ actions, descriptor, items }: SlotRendererProps) {
  const m = useMessages()

  if (items.length === 0) {
    return (
      <div className={fallbackSlotRendererClassName}>
        <span className="text-[0.72rem] font-bold text-foreground-quaternary">
          {m.workflow_canvas_no_slot_items({ label: descriptor.label.toLowerCase() })}
        </span>
      </div>
    )
  }

  return (
    <div className={fallbackSlotRendererClassName}>
      {items.map((item) => (
        <div className={fallbackItemClassName} key={item.id}>
          <span className="truncate">{m.workflow_canvas_slot_item_label({ label: descriptor.label, index: item.order + 1 })}</span>
          <button
            aria-label={m.workflow_canvas_remove_slot_item({ label: descriptor.label })}
            className={fallbackButtonClassName}
            onClick={() => actions.onRemove(descriptor.slot, item.id)}
            type="button"
          >
            <X aria-hidden="true" size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

const fallbackSlotRendererSpec: SlotRendererSpec = {
  Component: FallbackSlotRenderer,
  id: 'fallback',
  match: () => true,
  priority: Number.MAX_SAFE_INTEGER,
}

export const slotRendererRegistry = new SlotRendererRegistry()
