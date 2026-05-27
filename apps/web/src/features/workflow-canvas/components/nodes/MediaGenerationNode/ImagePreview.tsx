import { memo } from 'react'
import type { NodeOutputResource } from '@mina/contracts/modules/tasks'

import { useMessages } from '../../../../../app/i18n-provider'
import { previewUrlForMedia } from '../../../utils/media-url'

interface ImagePreviewProps {
  resource?: NodeOutputResource | undefined
}

const placeholderClassName = 'mina-wc-node-placeholder flex size-full items-center justify-center text-[0.72rem] font-extrabold text-foreground-quaternary [&_svg]:opacity-70'
const nodeMediaClassName = 'mina-wc-node-media size-full object-cover'

export const ImagePreview = memo(function ImagePreview({ resource }: ImagePreviewProps) {
  const m = useMessages()

  if (!resource) {
    return <div className={placeholderClassName}>{m.workflow_canvas_no_output_selected()}</div>
  }
  const previewUrl = previewUrlForMedia(resource)
  if (!previewUrl) {
    return <div className={placeholderClassName}>{m.workflow_canvas_preview_unavailable()}</div>
  }
  return <img alt="" className={nodeMediaClassName} decoding="async" draggable={false} loading="lazy" src={previewUrl} />
})
