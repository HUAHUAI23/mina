import { memo, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { WorkflowNodeData } from '@mina/contracts/modules/canvas'

import { getTask } from '../../../api/workflow-queries'
import { taskKeys } from '../../../api/workflow-keys'
import { resolveMediaViewResource, selectableResources } from '../../../utils/media-view'
import { ImagePreview } from './ImagePreview'
import { MediaOutputStrip } from './MediaOutputStrip'
import { VideoPosterPreview } from './VideoPosterPreview'

interface MediaGenerationNodeProps extends NodeProps {
  onSelectOutput?(nodeId: string, taskId: string, outputResourceId: string, outputIndex: number): void
}

export const MediaGenerationNode = memo(function MediaGenerationNode({
  data,
  id,
  onSelectOutput,
}: MediaGenerationNodeProps) {
  const nodeData = data as WorkflowNodeData
  if (nodeData.nodeType !== 'image_generation' && nodeData.nodeType !== 'video_generation') {
    return null
  }
  const taskId = nodeData.mediaView?.taskId
  const taskQuery = useQuery({
    enabled: Boolean(taskId),
    queryFn: () => getTask(taskId ?? ''),
    queryKey: taskId ? taskKeys.detail(taskId) : taskKeys.detail('pending'),
    staleTime: 10_000,
  })
  const task = taskQuery.data?.item
  const resource = useMemo(() => resolveMediaViewResource(task?.output, nodeData.mediaView), [nodeData.mediaView, task?.output])
  const resources = useMemo(() => selectableResources(task?.output), [task?.output])
  const isVideo = nodeData.nodeType === 'video_generation'

  return (
    <article className="mina-wc-node mina-wc-media-node">
      <Handle className="mina-wc-handle" position={Position.Left} type="target" />
      <div className="mina-wc-node-header">
        <strong>{nodeData.title}</strong>
        <span>{isVideo ? 'Video' : 'Image'}</span>
      </div>
      <div className="mina-wc-node-preview">
        {isVideo ? <VideoPosterPreview resource={resource} /> : <ImagePreview resource={resource} />}
      </div>
      <MediaOutputStrip
        mediaView={nodeData.mediaView}
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
