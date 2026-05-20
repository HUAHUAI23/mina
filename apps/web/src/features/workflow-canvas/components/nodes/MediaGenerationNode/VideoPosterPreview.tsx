import { memo } from 'react'
import { Play } from 'lucide-react'
import type { NodeOutputResource } from '@mina/contracts/modules/tasks'

import { previewUrlForMedia } from '../../../utils/media-url'

interface VideoPosterPreviewProps {
  poster?: NodeOutputResource | undefined
  resource?: NodeOutputResource | undefined
}

export const VideoPosterPreview = memo(function VideoPosterPreview({ poster, resource }: VideoPosterPreviewProps) {
  if (!resource) {
    return <div className="mina-wc-node-placeholder">No poster selected</div>
  }
  const posterUrl = previewUrlForMedia(poster)
  if (!posterUrl) {
    return <div className="mina-wc-node-placeholder">Preview unavailable</div>
  }
  return (
    <div className="mina-wc-video-poster" aria-label="Video poster" role="img">
      <img alt="" decoding="async" draggable={false} src={posterUrl} loading="lazy" />
      <span>
        <Play aria-hidden="true" size={18} />
      </span>
    </div>
  )
})
