import { memo, useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import type { NodeOutputResource } from '@mina/contracts/modules/tasks'

import { previewUrlForMedia } from '../../../utils/media-url'

interface VideoPosterPreviewProps {
  poster?: NodeOutputResource | undefined
  resource?: NodeOutputResource | undefined
}

export const VideoPosterPreview = memo(function VideoPosterPreview({ poster, resource }: VideoPosterPreviewProps) {
  const [mounted, setMounted] = useState(false)
  const [mountedResourceKey, setMountedResourceKey] = useState<string | undefined>()
  const resourceKey = resource?.id ?? resource?.url
  useEffect(() => {
    setMounted(false)
  }, [resourceKey])

  if (!resource) {
    return <div className="mina-wc-node-placeholder">No poster selected</div>
  }
  const videoUrl = previewUrlForMedia(resource)
  if (!videoUrl) {
    return <div className="mina-wc-node-placeholder">Preview unavailable</div>
  }
  const posterUrl = previewUrlForMedia(poster)
  if (!posterUrl) {
    return <div className="mina-wc-node-placeholder">Preview unavailable</div>
  }
  if (mounted && mountedResourceKey === resourceKey) {
    return (
      <video
        autoPlay
        className="mina-wc-node-media"
        controls
        playsInline
        poster={posterUrl}
        preload="metadata"
        src={videoUrl}
      />
    )
  }
  return (
    <button
      className="mina-wc-video-poster"
      aria-label="Play video"
      onClick={() => {
        setMountedResourceKey(resourceKey)
        setMounted(true)
      }}
      type="button"
    >
      <img alt="" decoding="async" draggable={false} src={posterUrl} loading="lazy" />
      <span>
        <Play aria-hidden="true" size={18} />
      </span>
    </button>
  )
})
