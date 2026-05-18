import { memo } from 'react'
import type { NodeOutputResource } from '@mina/contracts/modules/tasks'

interface VideoPosterPreviewProps {
  resource?: NodeOutputResource | undefined
}

export const VideoPosterPreview = memo(function VideoPosterPreview({ resource }: VideoPosterPreviewProps) {
  if (!resource) {
    return <div className="mina-wc-node-placeholder">No poster selected</div>
  }
  return (
    <div className="mina-wc-video-poster">
      <span>{resource.role ?? 'generated_video'}</span>
    </div>
  )
})
