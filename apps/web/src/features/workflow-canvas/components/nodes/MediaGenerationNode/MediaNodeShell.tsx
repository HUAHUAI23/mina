import { memo, useEffect, useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { NodeMediaViewState } from '@mina/contracts/modules/canvas'

import { useMessages } from '../../../../../app/i18n-provider'
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

const mediaNodeClassName = 'mina-wc-node relative grid min-h-[274px] w-[390px] origin-center gap-[9px] overflow-visible rounded-[14px] bg-[color-mix(in_oklch,var(--surface-container-lowest)_92%,transparent)] p-3 shadow-[0_26px_48px_-34px_color-mix(in_oklch,var(--foreground)_28%,transparent),inset_0_0_0_1px_color-mix(in_oklch,var(--foreground-quaternary)_13%,transparent)]'
const nodeHeaderClassName = 'mina-wc-node-header flex items-center justify-between px-0.5'
const nodeTitleClassName = 'text-[0.84rem] text-foreground'
const nodeKindClassName = 'text-[0.66rem] font-extrabold text-foreground-tertiary'
const nodePreviewClassName = 'grid aspect-video place-items-center overflow-hidden rounded-xl bg-surface-container-high shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--foreground-quaternary)_10%,transparent)]'

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
  const m = useMessages()
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
    <article className={mediaNodeClassName}>
      <WorkflowNodeHandles />
      <div className={nodeHeaderClassName}>
        <strong className={nodeTitleClassName}>{title}</strong>
        <span className={nodeKindClassName}>{nodeType === 'video_generation' ? m.workflow_canvas_video() : m.workflow_canvas_image()}</span>
      </div>
      <div className={nodePreviewClassName}>
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
