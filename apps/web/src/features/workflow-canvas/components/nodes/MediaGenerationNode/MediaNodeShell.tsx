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
import { DetachFromGroupToolbar } from '../DetachFromGroupToolbar'

export interface MediaNodeShellRenderInput {
  nodeVisible: boolean
  preview: NodeMediaPreview
}

interface MediaNodeShellProps {
  id: string
  mediaView?: NodeMediaViewState | undefined
  nodeType: 'image_generation' | 'video_generation'
  parentId?: string | undefined
  renderPreview(input: MediaNodeShellRenderInput): ReactNode
  selected?: boolean | undefined
  title: string
}

const mediaNodeClassName = 'mina-wc-node mina-wc-media-node relative flex h-[292px] w-[390px] origin-center flex-col overflow-visible bg-transparent p-0'
const nodeHeaderClassName = 'mina-wc-node-header pointer-events-auto mb-1 flex h-8 min-w-0 flex-none cursor-grab items-center justify-between gap-3 rounded-full px-1'
const nodeKindClassName = 'mina-wc-node-chrome mina-wc-node-kind rounded-full bg-zinc-150/80 dark:bg-zinc-800/80 px-2.5 py-0.5 text-[10px] font-bold text-zinc-600 dark:text-zinc-400 border border-zinc-200/50 dark:border-zinc-700/50 uppercase tracking-wider'
const nodeHeaderActionsClassName = 'flex flex-none items-center gap-2'
const historyButtonClassName = 'mina-wc-node-chrome mina-wc-node-chrome-button mina-wc-history-button nodrag nopan pointer-events-auto flex size-8 flex-none items-center justify-center rounded-full border border-zinc-200/80 bg-zinc-50/90 p-0 text-zinc-500 shadow-sm transition-all duration-150 hover:bg-accent hover:text-accent-foreground aria-pressed:border-primary aria-pressed:bg-accent aria-pressed:text-accent-foreground dark:border-zinc-800/80 dark:bg-zinc-900/90 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 dark:aria-pressed:border-primary dark:aria-pressed:bg-zinc-800 dark:aria-pressed:text-zinc-50'
const runningOverlayClassName = 'absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 bg-zinc-100/95 dark:bg-zinc-900/95 text-xs font-bold text-zinc-650 dark:text-zinc-400'

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
  parentId,
  renderPreview,
  selected,
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

  const dynamicPreviewClassName = [
    'mina-wc-media-preview relative grid aspect-[16/10] w-full flex-none place-items-center overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/95 dark:bg-zinc-900/95 transition-all duration-300',
    selected
      ? 'border-primary ring-2 ring-primary/20 shadow-none'
      : 'shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700'
  ].join(' ')

  return (
    <article className={mediaNodeClassName}>
      {parentId ? <DetachFromGroupToolbar nodeId={id} visible={selected} /> : null}
      <WorkflowNodeHandles />
      <div className={nodeHeaderClassName}>
        <span className={nodeKindClassName}>{nodeType === 'video_generation' ? m.workflow_canvas_video() : m.workflow_canvas_image()}</span>
        <div className={nodeHeaderActionsClassName}>
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
      <div className={dynamicPreviewClassName} data-selected={selected ? 'true' : undefined}>
        {renderPreview({ nodeVisible, preview: visiblePreview })}
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
