import type { NodeMediaSlotItem, NodeOutputSelector } from '@mina/contracts/modules/media'

interface SlotOutputSelectorProps {
  item: NodeMediaSlotItem
  onChange(item: NodeMediaSlotItem): void
}

const selectorRoles: NodeOutputSelector['role'][] = ['generated_image', 'generated_video', 'first_frame', 'last_frame', 'video_cover']

type RunOutputSource = Extract<NodeMediaSlotItem['source'], { resolve: 'run_output' }>

const isSelectorRole = (value: string): value is NodeOutputSelector['role'] =>
  selectorRoles.some((role) => role === value)

const isRunOutputSource = (source: NodeMediaSlotItem['source']): source is RunOutputSource =>
  source.type === 'node_output' && source.resolve === 'run_output'

export function SlotOutputSelector({ item, onChange }: SlotOutputSelectorProps) {
  if (!isRunOutputSource(item.source)) {
    return null
  }
  const source = item.source
  const selector = source.selector
  return (
    <div className="mina-wc-slot-selector">
      <select
        aria-label="Output role"
        value={selector.role}
        onChange={(event) => {
          if (!isSelectorRole(event.target.value)) {
            return
          }
          onChange({
            ...item,
            source: {
              ...source,
              selector: { ...selector, role: event.target.value },
            },
          })
        }}
      >
        {selectorRoles.map((role) => (
          <option key={role} value={role}>
            {role}
          </option>
        ))}
      </select>
      <input
        aria-label="Output index"
        min={0}
        type="number"
        value={selector.index}
        onChange={(event) =>
          onChange({
            ...item,
            source: {
              ...source,
              selector: { ...selector, index: Math.max(0, Number(event.target.value) || 0) },
            },
          })
        }
      />
    </div>
  )
}
