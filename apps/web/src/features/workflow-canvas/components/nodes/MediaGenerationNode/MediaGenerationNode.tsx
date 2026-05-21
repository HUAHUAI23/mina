import { memo, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { NodeProps } from '@xyflow/react'

import { getTask } from '../../../api/workflow-queries'
import { taskKeys } from '../../../api/workflow-keys'
import { createNodeMediaPreview, useMediaPreviewStore } from '../../../media/media-preview-store'
import { markCanvasNodeRender } from '../../../diagnostics/canvas-render-counts'
import { useWorkflowRuntimeStore } from '../../../store/workflow-runtime-store'
import type {
  ImageGenerationFlowNode,
  VideoGenerationFlowNode,
  WorkflowFlowNodeData,
} from '../../../domain/flow-types'
import { ImagePreview } from './ImagePreview'
import { MediaOutputStrip } from './MediaOutputStrip'
import { VideoPosterPreview } from './VideoPosterPreview'
import { WorkflowNodeHandles } from '../WorkflowNodeHandles'

type MediaGenerationNodeProps = NodeProps<ImageGenerationFlowNode | VideoGenerationFlowNode>

interface MediaGenerationNodeViewProps {
  data: WorkflowFlowNodeData & { nodeType: 'image_generation' | 'video_generation' }
  id: string
}

const mediaGenerationNodeViewPropsEqual = (
  previous: MediaGenerationNodeViewProps,
  next: MediaGenerationNodeViewProps,
): boolean =>
  previous.id === next.id &&
  previous.data.nodeId === next.data.nodeId &&
  previous.data.nodeType === next.data.nodeType &&
  previous.data.title === next.data.title &&
  previous.data.mediaView?.taskId === next.data.mediaView?.taskId &&
  previous.data.mediaView?.outputResourceId === next.data.mediaView?.outputResourceId &&
  previous.data.mediaView?.outputIndex === next.data.mediaView?.outputIndex

const mediaGenerationNodeRenderSignature = (data: MediaGenerationNodeViewProps['data']): string =>
  JSON.stringify({
    mediaView: data.mediaView,
    nodeId: data.nodeId,
    nodeType: data.nodeType,
    title: data.title,
  })

const MediaGenerationNodeView = memo(function MediaGenerationNodeView({
  data,
  id,
}: MediaGenerationNodeViewProps) {
  markCanvasNodeRender(id, mediaGenerationNodeRenderSignature(data))
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
      <WorkflowNodeHandles />
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
    </article>
  )
}, mediaGenerationNodeViewPropsEqual)

export function MediaGenerationNode({ data, id }: MediaGenerationNodeProps) {
  return <MediaGenerationNodeView data={data} id={id} />
}
