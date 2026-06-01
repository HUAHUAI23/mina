import { memo, useEffect, useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { History, Loader2 } from 'lucide-react'
import type { NodeMediaViewState } from '@mina/contracts/modules/canvas'

import { useMessages } from '../../../../../app/i18n-provider'
import { getTask } from '../../../api/workflow-queries'
import { taskKeys } from '../../../api/workflow-keys'
import { createNodeMediaPreview, useMediaPreviewStore } from '../../../media/media-preview-store'
import { resolveNodeTaskView } from '../../../media/resolve-node-task-view'
import { markCanvasNodeRender } from '../../../diagnostics/canvas-render-counts'
import { useCanvasUiStore } from '../../../store/canvas-ui-store'
import { useNodeRuntimeStore } from '../../../store/node-runtime-store'
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
const nodeHeaderActionsClassName = 'flex items-center gap-1.5'
const historyButtonClassName = 'nodrag nopan flex size-6 flex-none items-center justify-center rounded-md border-0 bg-transparent p-0 text-foreground-tertiary hover:bg-surface-container-high hover:text-foreground aria-pressed:bg-surface-container-high aria-pressed:text-foreground'
const nodePreviewClassName = 'relative grid aspect-video place-items-center overflow-hidden rounded-xl bg-surface-container-high shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--foreground-quaternary)_10%,transparent)]'
const runningOverlayClassName = 'absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 bg-[color-mix(in_oklch,var(--surface-container-lowest)_64%,transparent)] text-[0.7rem] font-bold text-foreground-tertiary backdrop-blur-[1px]'

const mediaNodeRenderSignature = (input: {
  id: string
  mediaView?: NodeMediaViewState | undefined
  nodeType: 'image_generation' | 'video_generation'
  taskId: string | undefined
  title: string
}): string =>
  JSON.stringify({
    mediaView: input.mediaView,
    nodeId: input.id,
    nodeType: input.nodeType,
    taskId: input.taskId,
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
  const onSelectOutput = useWorkflowRuntimeStore((state) => state.actions.onSelectOutput)
  const toggleHistoryPanel = useCanvasUiStore((state) => state.toggleHistoryPanel)
  const historyOpen = useCanvasUiStore((state) => state.historyPanelNodeId === id)
  const runtime = useNodeRuntimeStore((state) => state.byNodeId[id])
  const { isPinned, taskId } = resolveNodeTaskView(mediaView, runtime)
  markCanvasNodeRender(id, mediaNodeRenderSignature({ id, mediaView, nodeType, taskId, title }))
  const liveStatus = taskId ? runtime?.taskStatuses[taskId] ?? runtime?.status : undefined
  const isRunning = liveStatus === 'queued' || liveStatus === 'running'
  const nodeVisible = useCurrentNodeVisible()
  const taskQuery = useQuery({
    enabled: Boolean(taskId && nodeVisible),
    queryFn: () => getTask(taskId ?? ''),
    queryKey: taskId ? taskKeys.detail(taskId) : taskKeys.detail('pending'),
    // The event stream invalidates this key on status change; the interval is a fallback for when
    // the socket is down, and only runs while the visible node is actually working.
    refetchInterval: taskId && nodeVisible && isRunning ? 2_500 : false,
    staleTime: 10_000,
  })
  const task = taskQuery.data?.item
  // Only honour the pinned resource selector when actually pinned, so a stale partial selector
  // never mis-indexes the latest task's outputs.
  const previewMediaView = isPinned ? mediaView : undefined
  const setNodePreview = useMediaPreviewStore((state) => state.setNodePreview)
  const preview = useMemo(
    () => createNodeMediaPreview({ mediaView: previewMediaView, nodeType, output: task?.output }),
    [nodeType, previewMediaView, task?.output],
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
        <div className={nodeHeaderActionsClassName}>
          <span className={nodeKindClassName}>{nodeType === 'video_generation' ? m.workflow_canvas_video() : m.workflow_canvas_image()}</span>
          <button
            aria-label={historyOpen ? m.workflow_canvas_close_history() : m.workflow_canvas_view_history()}
            aria-pressed={historyOpen}
            className={historyButtonClassName}
            onClick={(event) => {
              event.stopPropagation()
              toggleHistoryPanel(id)
            }}
            onPointerDown={(event) => event.stopPropagation()}
            type="button"
          >
            <History aria-hidden="true" size={14} />
          </button>
        </div>
      </div>
      <div className={nodePreviewClassName}>
        {renderPreview({ preview: visiblePreview })}
        {isRunning ? (
          <div className={runningOverlayClassName}>
            <Loader2 aria-hidden="true" className="animate-spin" size={18} />
            <span>{liveStatus === 'queued' ? m.workflow_canvas_run_status_queued() : m.workflow_canvas_run_status_running()}</span>
          </div>
        ) : null}
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
