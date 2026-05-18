import { memo } from 'react'
import type { NodeMediaViewState } from '@mina/contracts/modules/canvas'
import type { NodeOutputResource } from '@mina/contracts/modules/tasks'

interface MediaOutputStripProps {
  mediaView?: NodeMediaViewState | undefined
  onSelect(resource: NodeOutputResource): void
  resources: NodeOutputResource[]
}

export const MediaOutputStrip = memo(function MediaOutputStrip({ mediaView, onSelect, resources }: MediaOutputStripProps) {
  if (resources.length <= 1) {
    return null
  }
  return (
    <div className="mina-wc-output-strip">
      {resources.map((resource) => {
        const active = mediaView?.outputResourceId
          ? mediaView.outputResourceId === resource.id
          : mediaView?.outputIndex === resource.index
        return (
          <button
            aria-label={`Select output ${resource.index + 1}`}
            className="mina-wc-output-thumb"
            data-active={active ? 'true' : undefined}
            key={resource.id}
            onClick={(event) => {
              event.stopPropagation()
              onSelect(resource)
            }}
            type="button"
          >
            {resource.kind === 'image' ? <img alt="" loading="lazy" src={resource.url} /> : <span>{resource.index + 1}</span>}
          </button>
        )
      })}
    </div>
  )
})
