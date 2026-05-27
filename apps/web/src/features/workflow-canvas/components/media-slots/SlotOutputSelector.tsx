import type { NodeMediaSlotItem, NodeOutputSelector } from '@mina/contracts/modules/media'

import { useMessages } from '../../../../app/i18n-provider'

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
  const m = useMessages()

  if (!isRunOutputSource(item.source)) {
    return null
  }
  const source = item.source
  const selector = source.selector
  return (
    <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
      <select
        aria-label={m.workflow_canvas_output_role()}
        className="min-h-10 rounded-lg border-0 bg-surface-container-high px-2.5 py-2 text-foreground outline-0 focus:bg-surface-container-lowest focus:shadow-[0_12px_28px_-18px_color-mix(in_oklch,var(--foreground)_18%,transparent)]"
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
        aria-label={m.workflow_canvas_output_index()}
        className="min-h-10 w-[72px] rounded-lg border-0 bg-surface-container-high px-2.5 py-2 text-foreground outline-0 focus:bg-surface-container-lowest focus:shadow-[0_12px_28px_-18px_color-mix(in_oklch,var(--foreground)_18%,transparent)]"
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
