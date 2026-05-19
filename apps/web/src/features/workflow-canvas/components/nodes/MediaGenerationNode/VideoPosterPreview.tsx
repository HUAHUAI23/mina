import { memo, useState } from 'react'
import { Play } from 'lucide-react'
import type { NodeOutputResource } from '@mina/contracts/modules/tasks'

import { previewUrlForMedia } from '../../../utils/media-url'

interface VideoPosterPreviewProps {
  poster?: NodeOutputResource | undefined
  resource?: NodeOutputResource | undefined
}

export const VideoPosterPreview = memo(function VideoPosterPreview({ poster, resource }: VideoPosterPreviewProps) {
  const [playing, setPlaying] = useState(false)
  if (!resource) {
    return <div className="mina-wc-node-placeholder">No poster selected</div>
  }
  const videoUrl = previewUrlForMedia(resource)
  const posterUrl = previewUrlForMedia(poster)
  if (!videoUrl) {
    return <div className="mina-wc-node-placeholder">Preview unavailable</div>
  }
  if (playing) {
    return <video className="mina-wc-node-media" src={videoUrl} controls autoPlay playsInline />
  }
  return (
    <button className="mina-wc-video-poster" type="button" onClick={() => setPlaying(true)} aria-label="Play video">
      {posterUrl ? <img alt="" src={posterUrl} loading="lazy" /> : null}
      <span>
        <Play aria-hidden="true" size={18} />
      </span>
    </button>
  )
})
