import { memo, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Handle, Position, type NodeProps } from '@xyflow/react'

import { getTask } from '../../../api/workflow-queries'
import { taskKeys } from '../../../api/workflow-keys'
import { primarySelectableResources, resolveMediaViewResource, videoPosterResource } from '../../../utils/media-view'
import { useCanvasUiStore } from '../../../store/canvas-ui-store'
import { useCanvasNode } from '../../../store/selectors'
import type { ImageGenerationFlowNode, VideoGenerationFlowNode } from '../../../domain/flow-types'
import { ImagePreview } from './ImagePreview'
import { MediaOutputStrip } from './MediaOutputStrip'
import { VideoPosterPreview } from './VideoPosterPreview'

export const MediaGenerationNode = memo(function MediaGenerationNode({
  data,
  id,
}: NodeProps<ImageGenerationFlowNode | VideoGenerationFlowNode>) {
  const node = useCanvasNode(id)
  const openNodePanel = useCanvasUiStore((state) => state.openNodePanel)
  if (!node || (node.data.nodeType !== 'image_generation' && node.data.nodeType !== 'video_generation')) {
    return null
  }
  const runtime = data.runtime
  const onSelectOutput = runtime?.onSelectOutput
  const mediaView = node.data.mediaView
  const taskId = mediaView?.taskId
  const taskQuery = useQuery({
    enabled: Boolean(taskId),
    queryFn: () => getTask(taskId ?? ''),
    queryKey: taskId ? taskKeys.detail(taskId) : taskKeys.detail('pending'),
    staleTime: 10_000,
  })
  const task = taskQuery.data?.item
  const resource = useMemo(() => resolveMediaViewResource(task?.output, mediaView), [mediaView, task?.output])
  const resources = useMemo(() => primarySelectableResources(task?.output), [task?.output])
  const isVideo = node.data.nodeType === 'video_generation'
  const poster = useMemo(() => videoPosterResource(task?.output, resource), [resource, task?.output])

  return (
    <article className="mina-wc-node mina-wc-media-node" onClick={() => openNodePanel(id, 'config')}>
      <Handle className="mina-wc-handle" position={Position.Left} type="target" />
      <div className="mina-wc-node-header">
        <strong>{node.data.title}</strong>
        <span>{isVideo ? 'Video' : 'Image'}</span>
      </div>
      <div className="mina-wc-node-preview">
        {isVideo ? <VideoPosterPreview resource={resource} poster={poster} /> : <ImagePreview resource={resource} />}
      </div>
      <MediaOutputStrip
        mediaView={mediaView}
        resources={resources}
        onSelect={(selected) => {
          if (taskId) {
            onSelectOutput?.(id, taskId, selected.id, selected.index)
          }
        }}
      />
      <Handle className="mina-wc-handle" position={Position.Right} type="source" />
    </article>
  )
})
