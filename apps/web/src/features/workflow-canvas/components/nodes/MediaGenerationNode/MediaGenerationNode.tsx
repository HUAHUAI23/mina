import { memo, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Handle, Position, type NodeProps } from '@xyflow/react'

import { getTask } from '../../../api/workflow-queries'
import { taskKeys } from '../../../api/workflow-keys'
import { createNodeMediaPreview, useMediaPreviewStore } from '../../../media/media-preview-store'
import { markCanvasNodeRender } from '../../../diagnostics/canvas-render-counts'
import { useWorkflowRuntimeStore } from '../../../store/workflow-runtime-store'
import type { ImageGenerationFlowNode, VideoGenerationFlowNode } from '../../../domain/flow-types'
import { ImagePreview } from './ImagePreview'
import { MediaOutputStrip } from './MediaOutputStrip'
import { VideoPosterPreview } from './VideoPosterPreview'

export const MediaGenerationNode = memo(function MediaGenerationNode({
  data,
  id,
}: NodeProps<ImageGenerationFlowNode | VideoGenerationFlowNode>) {
  markCanvasNodeRender(id)
  const onSelectOutput = useWorkflowRuntimeStore((state) => state.actions.onSelectOutput)
  const mediaView = data.mediaView
  const taskId = mediaView?.taskId
  const taskQuery = useQuery({
    enabled: Boolean(taskId),
    queryFn: () => getTask(taskId ?? ''),
    queryKey: taskId ? taskKeys.detail(taskId) : taskKeys.detail('pending'),
    staleTime: 10_000,
  })
  const task = taskQuery.data?.item
  const isVideo = data.nodeType === 'video_generation'
  const setNodePreview = useMediaPreviewStore((state) => state.setNodePreview)
  const preview = useMemo(
    () => createNodeMediaPreview({ mediaView, nodeType: data.nodeType, output: task?.output }),
    [data.nodeType, mediaView, task?.output],
  )
  const cachedPreview = useMediaPreviewStore((state) => state.previewByNodeId[id])
  useEffect(() => {
    if (task?.output) {
      setNodePreview(id, preview)
    }
  }, [id, preview, setNodePreview, task?.output])
  const visiblePreview = task?.output ? preview : cachedPreview ?? preview

  return (
    <article className="mina-wc-node mina-wc-media-node">
      <Handle className="mina-wc-handle" position={Position.Left} type="target" />
      <div className="mina-wc-node-header">
        <strong>{data.title}</strong>
        <span>{isVideo ? 'Video' : 'Image'}</span>
      </div>
      <div className="mina-wc-node-preview">
        {isVideo ? (
          <VideoPosterPreview resource={visiblePreview.resource} poster={visiblePreview.poster} />
        ) : (
          <ImagePreview resource={visiblePreview.resource} />
        )}
      </div>
      <MediaOutputStrip
        mediaView={mediaView}
        resources={visiblePreview.resources}
        onSelect={(selected) => {
          if (taskId) {
            onSelectOutput(id, taskId, selected.id, selected.index)
          }
        }}
      />
      <Handle className="mina-wc-handle" position={Position.Right} type="source" />
    </article>
  )
})
