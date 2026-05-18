import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import type { NodeMediaSlotItem as NodeMediaSlotItemType } from '@mina/contracts/modules/media'
import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import { SlotOutputSelector } from './SlotOutputSelector'

interface MediaSlotItemProps {
  item: NodeMediaSlotItemType
  nodes: WorkflowCanvasNode[]
  onChange(item: NodeMediaSlotItemType): void
  onMove(direction: -1 | 1): void
  onRemove(): void
}

const isNodeOutput = (
  source: NodeMediaSlotItemType['source'],
): source is Extract<NodeMediaSlotItemType['source'], { type: 'node_output' }> => source.type === 'node_output'

export function MediaSlotItem({ item, nodes, onChange, onMove, onRemove }: MediaSlotItemProps) {
  const nodeOutputSource = isNodeOutput(item.source) ? item.source : undefined
  const sourceNode = nodeOutputSource ? nodes.find((node) => node.id === nodeOutputSource.nodeId) : undefined
  const title =
    item.source.type === 'media_object'
      ? 'Uploaded media'
      : item.source.type === 'external_url'
        ? 'External media'
        : `From ${sourceNode?.data.title ?? nodeOutputSource?.nodeId ?? 'node'}`
  const detail =
    isNodeOutput(item.source)
      ? item.source.resolve === 'run_output'
        ? 'Run output'
        : 'Current media'
      : item.source.type

  return (
    <article className="mina-wc-slot-item">
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
        <SlotOutputSelector item={item} onChange={onChange} />
      </div>
      <div className="mina-wc-slot-actions">
        <button aria-label="Move slot up" onClick={() => onMove(-1)} type="button">
          <ArrowUp aria-hidden="true" size={14} />
        </button>
        <button aria-label="Move slot down" onClick={() => onMove(1)} type="button">
          <ArrowDown aria-hidden="true" size={14} />
        </button>
        <button aria-label="Remove slot item" onClick={onRemove} type="button">
          <Trash2 aria-hidden="true" size={14} />
        </button>
      </div>
    </article>
  )
}
