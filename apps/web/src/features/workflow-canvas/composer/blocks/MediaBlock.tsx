import { MediaSlotList } from '../../components/media-slots/MediaSlotList'
import { useMediaTaskForm } from '../media-task-form'
import type { ComposerSurface } from '../types'
import type { MediaGenerationCanvasNode } from '../../domain/canvas-node-types'

interface MediaBlockProps {
  node: MediaGenerationCanvasNode
  surface: Exclude<ComposerSurface, 'hidden'>
}

export function MediaBlock(_: MediaBlockProps) {
  const { mediaActions, mediaSlots, nodeType } = useMediaTaskForm()

  return (
    <MediaSlotList
      mediaSlots={mediaSlots}
      nodeType={nodeType}
      {...(mediaActions.uploading !== undefined ? { uploading: mediaActions.uploading } : {})}
      onAddUpload={mediaActions.onAddUpload}
      onChange={mediaActions.onChange}
      onRemove={mediaActions.onRemove}
      onReplaceUpload={mediaActions.onReplaceUpload}
      onReorder={mediaActions.onReorder}
    />
  )
}
