import type { ComponentType } from 'react'
import type { MediaSlotName, NodeMediaSlotItem } from '@mina/contracts/modules/media'
import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

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
  node: WorkflowCanvasNode
  onExpandedChange?: ((expanded: boolean) => void) | undefined
  variant?: 'attachment' | 'block'
}

export interface SlotRendererSpec {
  Component: ComponentType<SlotRendererProps>
  id: string
  match(input: { descriptor: MediaSlotDescriptor; node: WorkflowCanvasNode }): boolean
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

  resolve(input: { descriptor: MediaSlotDescriptor; node: WorkflowCanvasNode }): SlotRendererSpec {
    const [spec] = this.specs
      .filter((candidate) => candidate.match(input))
      .sort((left, right) => left.priority - right.priority)
    if (!spec) {
      throw new Error(`No slot renderer registered for ${input.descriptor.slot}`)
    }
    return spec
  }
}

export const slotRendererRegistry = new SlotRendererRegistry()
