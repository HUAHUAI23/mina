import { memo, useEffect, useRef } from 'react'
import { Film, Play } from 'lucide-react'
import { useNodeId } from '@xyflow/react'
import type { NodeOutputResource } from '@mina/contracts/modules/tasks'

import { useMessages } from '../../../../../app/i18n-provider'
import { useActiveVideoStore } from '../../../media/active-video-store'
import { previewUrlForMedia } from '../../../utils/media-url'
import { useFlowRenderStore } from '../../../render/flow-render-store'

interface VideoPosterPreviewProps {
  nodeVisible: boolean
  poster?: NodeOutputResource | undefined
  resource?: NodeOutputResource | undefined
}

const placeholderClassName = 'mina-wc-node-placeholder flex size-full items-center justify-center text-[0.72rem] font-extrabold text-foreground-quaternary [&_svg]:opacity-70'
const nodeMediaClassName = 'mina-wc-node-media size-full object-cover'
const videoPosterClassName = 'mina-wc-video-poster relative flex size-full items-center justify-center border-0 bg-surface-container-high p-0 text-[0.72rem] font-extrabold text-foreground-quaternary'
const posterImageClassName = 'size-full object-cover'
const playBadgeClassName = 'absolute flex size-10.5 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--foreground)_72%,transparent)] text-primary-foreground'

export const VideoPosterPreview = memo(function VideoPosterPreview({ nodeVisible, poster, resource }: VideoPosterPreviewProps) {
  const m = useMessages()
  const nodeId = useNodeId()
  const activeNodeId = useActiveVideoStore((state) => state.activeNodeId)
  const play = useActiveVideoStore((state) => state.play)
  const stop = useActiveVideoStore((state) => state.stop)
  const viewportMoving = useFlowRenderStore((state) => state.interaction.viewportMoving)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const resourceKey = resource?.id ?? resource?.url
  const mounted = Boolean(nodeId && activeNodeId === nodeId && nodeVisible)

  useEffect(() => {
    if (nodeId) {
      stop(nodeId)
    }
  }, [nodeId, resourceKey, stop])
  useEffect(() => {
    if (nodeId && !nodeVisible) {
      stop(nodeId)
    }
  }, [nodeId, nodeVisible, stop])
  useEffect(() => () => {
    if (nodeId) {
      stop(nodeId)
    }
  }, [nodeId, stop])
  useEffect(() => {
    if (nodeId && viewportMoving && videoRef.current?.paused) {
      stop(nodeId)
    }
  }, [nodeId, stop, viewportMoving])

  if (!resource || resource.kind !== 'video') {
    return <div className={placeholderClassName}>{m.workflow_canvas_no_poster_selected()}</div>
  }
  const videoUrl = previewUrlForMedia(resource)
  if (!videoUrl) {
    return <div className={placeholderClassName}>{m.workflow_canvas_preview_unavailable()}</div>
  }
  const posterUrl = previewUrlForMedia(poster)
  if (mounted) {
    return (
      <video
        autoPlay
        className={nodeMediaClassName}
        controls
        playsInline
        {...(posterUrl ? { poster: posterUrl } : {})}
        preload="metadata"
        ref={videoRef}
        src={videoUrl}
      />
    )
  }
  return (
    <button
      className={videoPosterClassName}
      aria-label={m.workflow_canvas_play_video()}
      onClick={() => {
        if (nodeId) {
          play(nodeId)
        }
      }}
      type="button"
    >
      {posterUrl ? (
        <img alt="" className={posterImageClassName} decoding="async" draggable={false} src={posterUrl} loading="lazy" />
      ) : (
        <span className={placeholderClassName}>
          <Film aria-hidden="true" size={28} />
        </span>
      )}
      <span className={playBadgeClassName}>
        <Play aria-hidden="true" size={18} />
      </span>
    </button>
  )
})
