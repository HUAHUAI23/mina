import { memo } from 'react'
import type { NodeOutputResource } from '@mina/contracts/modules/tasks'

import { previewUrlForMedia } from '../../../utils/media-url'

interface ImagePreviewProps {
  resource?: NodeOutputResource | undefined
}

export const ImagePreview = memo(function ImagePreview({ resource }: ImagePreviewProps) {
  if (!resource) {
    return <div className="mina-wc-node-placeholder">No output selected</div>
  }
  const previewUrl = previewUrlForMedia(resource)
  if (!previewUrl) {
    return <div className="mina-wc-node-placeholder">Preview unavailable</div>
  }
  return <img alt="" className="mina-wc-node-media" decoding="async" draggable={false} loading="lazy" src={previewUrl} />
})
