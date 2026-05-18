import { memo } from 'react'
import type { NodeOutputResource } from '@mina/contracts/modules/tasks'

interface ImagePreviewProps {
  resource?: NodeOutputResource | undefined
}

export const ImagePreview = memo(function ImagePreview({ resource }: ImagePreviewProps) {
  if (!resource) {
    return <div className="mina-wc-node-placeholder">No output selected</div>
  }
  return <img alt="" className="mina-wc-node-media" loading="lazy" src={resource.url} />
})
