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
    <div className="flex min-w-0 gap-1.5 overflow-x-auto">
      {resources.map((resource) => {
        const active = mediaView?.outputResourceId
          ? mediaView.outputResourceId === resource.id
          : mediaView?.outputIndex === resource.index
        const previewUrl = previewUrlForMedia(resource)
        return (
          <button
            aria-label={m.workflow_canvas_select_output_number({ index: resource.index + 1 })}
            className="flex h-10 w-11 flex-none items-center justify-center overflow-hidden rounded-md border-0 bg-surface-container-lowest p-0 text-foreground-tertiary data-[active=true]:outline-2 data-[active=true]:outline-foreground-secondary/60"
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
