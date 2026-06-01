import { memo } from 'react'
import type { NodeMediaViewState } from '@mina/contracts/modules/canvas'
import type { NodeOutputResource } from '@mina/contracts/modules/tasks'

import { useMessages } from '../../../../../app/i18n-provider'
import { previewUrlForMedia } from '../../../utils/media-url'

interface MediaOutputStripProps {
  mediaView?: NodeMediaViewState | undefined
  onSelect(resource: NodeOutputResource): void
  resources: NodeOutputResource[]
}

export const MediaOutputStrip = memo(function MediaOutputStrip({ mediaView, onSelect, resources }: MediaOutputStripProps) {
  const m = useMessages()

  if (resources.length <= 1) {
    return null
  }
  return (
    <div className="nodrag nopan pointer-events-auto absolute left-1/2 -bottom-12 z-20 flex max-w-[calc(100%-2rem)] -translate-x-1/2 gap-2 overflow-x-auto">
      {resources.map((resource) => {
        const active = mediaView?.outputResourceId
          ? mediaView.outputResourceId === resource.id
          : mediaView?.outputIndex === resource.index
        const previewUrl = previewUrlForMedia(resource)
        return (
          <button
            aria-label={m.workflow_canvas_select_output_number({ index: resource.index + 1 })}
            className="flex size-9 flex-none items-center justify-center overflow-hidden rounded-md border-0 bg-surface-container-lowest/76 p-0 text-xs font-black text-foreground-tertiary opacity-72 shadow-[0_10px_24px_-22px_color-mix(in_oklch,var(--foreground)_24%,transparent),inset_0_0_0_1px_color-mix(in_oklch,var(--foreground-quaternary)_10%,transparent)] data-[active=true]:opacity-100 data-[active=true]:shadow-[0_12px_26px_-22px_color-mix(in_oklch,var(--foreground)_26%,transparent),inset_0_0_0_2px_color-mix(in_oklch,var(--primary)_58%,var(--foreground-secondary))]"
            data-active={active ? 'true' : undefined}
            key={resource.id}
            onClick={(event) => {
              event.stopPropagation()
              onSelect(resource)
            }}
            type="button"
          >
            {resource.kind === 'image' && previewUrl ? (
              <img alt="" className="size-full object-cover" loading="lazy" src={previewUrl} />
            ) : (
              <span>{resource.role === 'generated_video' ? 'V' : resource.index + 1}</span>
            )}
          </button>
        )
      })}
    </div>
  )
})
