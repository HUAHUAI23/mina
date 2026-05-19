import { memo } from 'react'
import type { NodeMediaViewState } from '@mina/contracts/modules/canvas'
import type { NodeOutputResource } from '@mina/contracts/modules/tasks'

import { previewUrlForMedia } from '../../../utils/media-url'

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
        const previewUrl = previewUrlForMedia(resource)
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
            {resource.kind === 'image' && previewUrl ? (
              <img alt="" loading="lazy" src={previewUrl} />
            ) : (
              <span>{resource.role === 'generated_video' ? 'V' : resource.index + 1}</span>
            )}
          </button>
        )
      })}
    </div>
  )
})
