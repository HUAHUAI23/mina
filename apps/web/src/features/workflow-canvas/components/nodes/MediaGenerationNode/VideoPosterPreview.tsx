import { memo, useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import type { NodeOutputResource } from '@mina/contracts/modules/tasks'

import { previewUrlForMedia } from '../../../utils/media-url'

interface VideoPosterPreviewProps {
  poster?: NodeOutputResource | undefined
  resource?: NodeOutputResource | undefined
}

const placeholderClassName = 'mina-wc-node-placeholder flex size-full items-center justify-center text-[0.72rem] font-extrabold text-foreground-quaternary [&_svg]:opacity-70'
const nodeMediaClassName = 'mina-wc-node-media size-full object-cover'
const videoPosterClassName = 'mina-wc-video-poster relative flex size-full items-center justify-center border-0 bg-surface-container-high p-0 text-[0.72rem] font-extrabold text-foreground-quaternary'
const posterImageClassName = 'size-full object-cover'
const playBadgeClassName = 'absolute flex size-10.5 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--foreground)_72%,transparent)] text-primary-foreground'

export const VideoPosterPreview = memo(function VideoPosterPreview({ poster, resource }: VideoPosterPreviewProps) {
  const [mounted, setMounted] = useState(false)
  const [mountedResourceKey, setMountedResourceKey] = useState<string | undefined>()
  const resourceKey = resource?.id ?? resource?.url
  useEffect(() => {
    setMounted(false)
  }, [resourceKey])

  if (!resource) {
    return <div className={placeholderClassName}>No poster selected</div>
  }
  const videoUrl = previewUrlForMedia(resource)
  if (!videoUrl) {
    return <div className={placeholderClassName}>Preview unavailable</div>
  }
  const posterUrl = previewUrlForMedia(poster)
  if (!posterUrl) {
    return <div className={placeholderClassName}>Preview unavailable</div>
  }
  if (mounted && mountedResourceKey === resourceKey) {
    return (
      <video
        autoPlay
        className={nodeMediaClassName}
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
      className={videoPosterClassName}
      aria-label="Play video"
      onClick={() => {
        setMountedResourceKey(resourceKey)
        setMounted(true)
      }}
      type="button"
    >
      <img alt="" className={posterImageClassName} decoding="async" draggable={false} src={posterUrl} loading="lazy" />
      <span className={playBadgeClassName}>
        <Play aria-hidden="true" size={18} />
      </span>
    </button>
  )
})
