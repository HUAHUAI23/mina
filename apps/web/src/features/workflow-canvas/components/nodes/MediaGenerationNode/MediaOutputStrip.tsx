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
    <div className="nodrag nopan pointer-events-auto absolute left-1/2 -bottom-[68px] z-20 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-2xl border border-zinc-200/80 bg-zinc-50/95 p-2 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900/95">
      {resources.map((resource) => {
        const active = mediaView?.outputResourceId
          ? mediaView.outputResourceId === resource.id
          : mediaView?.outputIndex === resource.index
        const previewUrl = previewUrlForMedia(resource)
        return (
          <button
            aria-label={m.workflow_canvas_select_output_number({ index: resource.index + 1 })}
            className="flex aspect-[16/10] h-12 flex-none items-center justify-center overflow-hidden rounded-[8px] border border-zinc-200 dark:border-zinc-800 bg-zinc-100/60 dark:bg-zinc-900/40 p-0 text-xs font-semibold text-zinc-500 shadow-sm transition-all duration-200 hover:scale-105 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-800 dark:hover:text-zinc-200 data-[active=true]:scale-105 data-[active=true]:border-primary dark:data-[active=true]:border-primary data-[active=true]:ring-2 data-[active=true]:ring-primary/20 dark:data-[active=true]:ring-primary/30"
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
