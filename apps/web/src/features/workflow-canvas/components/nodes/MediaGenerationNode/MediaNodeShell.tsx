import { memo, useEffect, useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { NodeMediaViewState } from '@mina/contracts/modules/canvas'

import { getTask } from '../../../api/workflow-queries'
import { taskKeys } from '../../../api/workflow-keys'
import { createNodeMediaPreview, useMediaPreviewStore } from '../../../media/media-preview-store'
import { markCanvasNodeRender } from '../../../diagnostics/canvas-render-counts'
import { useWorkflowRuntimeStore } from '../../../store/workflow-runtime-store'
import type { NodeMediaPreview } from '../../../media/media-preview-store'
import { MediaOutputStrip } from './MediaOutputStrip'
import { WorkflowNodeHandles } from '../WorkflowNodeHandles'
import { useCurrentNodeVisible } from '../use-node-visibility'

export interface MediaNodeShellRenderInput {
  preview: NodeMediaPreview
}

interface MediaNodeShellProps {
  id: string
  mediaView?: NodeMediaViewState | undefined
  nodeType: 'image_generation' | 'video_generation'
  renderPreview(input: MediaNodeShellRenderInput): ReactNode
  title: string
}

const mediaNodeRenderSignature = (input: Omit<MediaNodeShellProps, 'renderPreview'>): string =>
  JSON.stringify({
    mediaView: input.mediaView,
    nodeId: input.id,
    nodeType: input.nodeType,
    title: input.title,
  })

export const MediaNodeShell = memo(function MediaNodeShell({
  id,
  mediaView,
  nodeType,
  renderPreview,
  title,
}: MediaNodeShellProps) {
  markCanvasNodeRender(id, mediaNodeRenderSignature({ id, mediaView, nodeType, title }))
  const onSelectOutput = useWorkflowRuntimeStore((state) => state.actions.onSelectOutput)
  const taskId = mediaView?.taskId
  const nodeVisible = useCurrentNodeVisible()
  const taskQuery = useQuery({
    enabled: Boolean(taskId && nodeVisible),
    queryFn: () => getTask(taskId ?? ''),
    queryKey: taskId ? taskKeys.detail(taskId) : taskKeys.detail('pending'),
    staleTime: 10_000,
  })
  const task = taskQuery.data?.item
  const setNodePreview = useMediaPreviewStore((state) => state.setNodePreview)
  const preview = useMemo(
    () => createNodeMediaPreview({ mediaView, nodeType, output: task?.output }),
    [nodeType, mediaView, task?.output],
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
        <strong>{title}</strong>
        <span>{nodeType === 'video_generation' ? 'Video' : 'Image'}</span>
      </div>
      <div className="mina-wc-node-preview">
        {renderPreview({ preview: visiblePreview })}
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
})
