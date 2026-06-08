import { Panel } from '@xyflow/react'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, Check, Clapperboard, Clock, Loader2, X } from 'lucide-react'
import type { TaskStatus } from '@mina/contracts/modules/tasks'
import { formatDateTime } from '@mina/i18n'
import { cn } from '@mina/ui/lib/utils'

import { useI18n, useMessages } from '../../../../app/i18n-provider'
import { workflowKeys } from '../../api/workflow-keys'
import { listNodeTasks } from '../../api/workflow-queries'
import { isMediaGenerationNode } from '../../domain/canvas-node-types'
import { historyThumbnailResource } from '../../media/history-thumbnail'
import { primarySelectableResources } from '../../utils/media-view'
import { previewUrlForMedia } from '../../utils/media-url'
import { useCanvasStore } from '../../store/canvas-store'
import { useCanvasUiStore } from '../../store/canvas-ui-store'
import { useNodeRuntimeStore } from '../../store/node-runtime-store'
import { useCanvasNode, useCanvasWorkflowId } from '../../store/selectors'

const railPanelClassName = 'mina-wc-history-rail nodrag nowheel nopan pointer-events-auto'
const railShellClassName = 'mina-wc-floating-surface grid max-h-[min(78dvh,46rem)] w-[26.5rem] min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-2.5 overflow-hidden rounded-[22px] p-4 border border-zinc-200/50 bg-zinc-50/98 dark:border-zinc-800/50 dark:bg-zinc-950/98'
const railHeaderClassName = 'flex items-center justify-between gap-3 pb-1'
const closeButtonClassName = 'flex size-8 flex-none items-center justify-center rounded-full border border-zinc-200/80 bg-zinc-50 p-0 text-zinc-400 shadow-sm transition-all duration-200 hover:bg-zinc-100 hover:text-zinc-800 dark:border-zinc-800/80 dark:bg-zinc-900 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200'
const followButtonClassName = 'group flex min-h-11 items-center justify-between gap-3 rounded-[16px] border border-zinc-200 bg-zinc-50/50 px-3.5 py-2.5 text-left text-sm font-semibold text-zinc-600 shadow-sm transition-all duration-200 hover:bg-zinc-100/50 hover:text-zinc-950 aria-pressed:border-zinc-400 aria-pressed:bg-zinc-100/80 aria-pressed:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-400 dark:hover:bg-zinc-900/60 dark:hover:text-zinc-50 dark:aria-pressed:border-zinc-600 dark:aria-pressed:bg-zinc-900/80 dark:aria-pressed:text-zinc-50'
const listClassName = 'grid min-h-0 content-start gap-2.5 overflow-auto pr-1 [scrollbar-gutter:stable]'
const taskCardClassName = 'group grid min-w-0 gap-2.5 rounded-[16px] border border-zinc-200/50 bg-zinc-50/30 p-3 shadow-sm transition-all duration-200 hover:bg-zinc-50/80 hover:shadow-md dark:border-zinc-800/40 dark:bg-zinc-900/10 dark:hover:bg-zinc-900/30'
const historyPreviewClassName = 'relative flex aspect-[16/10] w-full min-w-0 items-center justify-center overflow-hidden rounded-[14px] border border-zinc-200/60 bg-zinc-100 p-0 text-xs font-semibold text-zinc-400 shadow-sm transition-all duration-300 hover:border-zinc-300 dark:border-zinc-800/60 dark:bg-zinc-900 dark:text-zinc-600 dark:hover:border-zinc-700'
const historyPreviewSelectedClassName = 'border-zinc-500 ring-2 ring-zinc-400/20 dark:border-zinc-400 dark:ring-zinc-600/20'
const outputStripClassName = 'flex max-w-full gap-2.5 overflow-x-auto px-0.5 py-1.5'
const thumbButtonClassName = 'relative flex aspect-[16/10] h-9 flex-none items-center justify-center overflow-hidden rounded-md border border-zinc-200 bg-zinc-100/40 p-0 text-xs font-semibold text-zinc-400 transition-all duration-200 hover:scale-105 hover:border-zinc-400 hover:text-zinc-800 aria-pressed:scale-105 aria-pressed:border-zinc-900 aria-pressed:ring-1 aria-pressed:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-500 dark:hover:border-zinc-600 dark:hover:text-zinc-200 dark:aria-pressed:border-zinc-100 dark:aria-pressed:ring-zinc-100'
const emptyClassName = 'grid min-h-32 place-items-center rounded-[16px] border border-dashed border-zinc-200 bg-zinc-50/50 p-5 text-center text-sm font-semibold text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-500'
const historyPlaceholderClassName = 'absolute inset-0 grid place-items-center bg-zinc-100/80 text-center text-xs font-semibold text-zinc-400 dark:bg-zinc-900/80 dark:text-zinc-600'

const statusLabel = (status: TaskStatus | undefined, m: ReturnType<typeof useMessages>): string => {
  switch (status) {
    case 'queued':
      return m.workflow_canvas_run_status_queued()
    case 'running':
      return m.workflow_canvas_run_status_running()
    case 'failed':
    case 'cancelled':
      return m.workflow_canvas_run_status_failed()
    default:
      return m.workflow_canvas_run_status_succeeded()
  }
}

/**
 * Right-docked rail listing a media node's task history. Selecting a thumbnail pins the node's
 * mediaView (collaborative, via Yjs), so every participant sees the same choice; "Follow latest"
 * clears the pin and lets the node track the newest task from the facts layer. Live task status
 * comes from the node-runtime store so entries flip from "Generating…" to a thumbnail in place.
 */
export function NodeHistoryRail() {
  const m = useMessages()
  const { locale } = useI18n()
  const workflowId = useCanvasWorkflowId()
  const nodeId = useCanvasUiStore((state) => state.historyPanelNodeId)
  const closeHistoryPanel = useCanvasUiStore((state) => state.closeHistoryPanel)
  const setNodeMediaView = useCanvasStore((state) => state.setNodeMediaView)
  const node = useCanvasNode(nodeId ?? '')
  const mediaView = isMediaGenerationNode(node) ? node.data.mediaView : undefined
  const runtime = useNodeRuntimeStore((state) => (nodeId ? state.byNodeId[nodeId] : undefined))
  const enabled = Boolean(nodeId && workflowId && isMediaGenerationNode(node))
  const query = useQuery({
    enabled,
    queryFn: () => listNodeTasks(workflowId ?? '', nodeId ?? ''),
    queryKey: workflowKeys.nodeTasks(workflowId ?? '', nodeId ?? ''),
  })

  if (!enabled || !nodeId) {
    return null
  }

  const isFollowingLatest = !mediaView?.taskId

  return (
    <Panel position="top-right" className={railPanelClassName} data-mina-canvas-ignore="true" data-mina-canvas-panel-root="true">
      <section className={railShellClassName} aria-label={m.workflow_canvas_task_history()}>
        <div className={railHeaderClassName}>
          <div className="grid min-w-0 gap-0.5">
            <span className="text-[9px] font-bold tracking-[0.22em] text-zinc-400 dark:text-zinc-500 uppercase">
              {m.workflow_canvas_history_eyebrow()}
            </span>
            <div className="flex items-center gap-2">
              <strong className="font-display text-[17px] font-semibold tracking-tight text-zinc-800 dark:text-zinc-100">
                {m.workflow_canvas_task_history()}
              </strong>
              <span className="inline-flex items-center justify-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {query.data?.items.length ?? 0}
              </span>
            </div>
          </div>
          <button aria-label={m.workflow_canvas_close_history()} className={closeButtonClassName} onClick={closeHistoryPanel} type="button">
            <X aria-hidden="true" size={15} />
          </button>
        </div>

        <button
          aria-pressed={isFollowingLatest}
          className={followButtonClassName}
          onClick={() => setNodeMediaView(nodeId, undefined)}
          type="button"
        >
          <span className="grid min-w-0 gap-0.5">
            <span className="text-zinc-800 dark:text-zinc-200 group-hover:text-zinc-950 dark:group-hover:text-zinc-50">{isFollowingLatest ? m.workflow_canvas_following_latest() : m.workflow_canvas_follow_latest()}</span>
            <span className="text-xs font-medium text-zinc-400 group-aria-pressed:text-zinc-500 dark:text-zinc-500 dark:group-aria-pressed:text-zinc-400">
              {m.workflow_canvas_history_follow_hint()}
            </span>
          </span>
          <span className="grid size-6 flex-none place-items-center rounded-full bg-zinc-200/50 text-zinc-400 transition-all duration-200 group-aria-pressed:bg-zinc-900 group-aria-pressed:text-zinc-50 dark:bg-zinc-800 dark:text-zinc-600 dark:group-aria-pressed:bg-zinc-100 dark:group-aria-pressed:text-zinc-900">
            {isFollowingLatest ? <Check aria-hidden="true" size={12} className="stroke-[3]" /> : <Loader2 aria-hidden="true" size={12} className="animate-spin" />}
          </span>
        </button>

        <div className={listClassName}>
          {query.data?.items.map((item) => {
            const resources = primarySelectableResources(item.task.output)
            const liveStatus = runtime?.taskStatuses[item.task.id] ?? item.task.status
            const pendingLabel = statusLabel(liveStatus, m)
            const selectedResource = resources.find((resource) => (
              mediaView?.taskId === item.task.id &&
              (mediaView.outputResourceId ? mediaView.outputResourceId === resource.id : mediaView.outputIndex === resource.index)
            ))
            const fallbackResource = resources[0]
            const displayResource = selectedResource ?? fallbackResource
            const previewResource = displayResource ? historyThumbnailResource(item.task.output, displayResource) : undefined
            const previewUrl = previewUrlForMedia(previewResource)
            const active = liveStatus === 'queued' || liveStatus === 'running'
            const isSelected = Boolean(selectedResource)

            return (
              <article
                className={cn(
                  taskCardClassName,
                  isSelected && 'border-zinc-900 bg-zinc-50/90 shadow-md ring-1 ring-zinc-900/10 dark:border-zinc-100 dark:bg-zinc-900/40 dark:ring-zinc-100/10'
                )}
                key={`${item.workflowRunId}:${item.task.id}`}
              >
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    {liveStatus === 'succeeded' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700 border border-zinc-200/50 dark:bg-zinc-800/80 dark:text-zinc-300 dark:border-zinc-700/50">
                        <Check className="size-3 text-zinc-500 dark:text-zinc-400 stroke-[2.5]" />
                        {pendingLabel}
                      </span>
                    ) : liveStatus === 'failed' || liveStatus === 'cancelled' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700 border border-zinc-200/50 dark:bg-zinc-800/80 dark:text-zinc-300 dark:border-zinc-700/50">
                        <AlertCircle className="size-3 text-zinc-500 dark:text-zinc-400" />
                        {pendingLabel}
                      </span>
                    ) : liveStatus === 'running' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700 border border-zinc-200/50 dark:bg-zinc-800/80 dark:text-zinc-300 dark:border-zinc-700/50">
                        <Loader2 className="size-3 animate-spin text-zinc-500 dark:text-zinc-400" />
                        {pendingLabel}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-50 px-2 py-0.5 text-xs font-semibold text-zinc-500 border border-zinc-200/30 dark:bg-zinc-900/60 dark:text-zinc-400 dark:border-zinc-800/40">
                        <Clock className="size-3 text-zinc-400 dark:text-zinc-500" />
                        {pendingLabel}
                      </span>
                    )}
                  </div>
                  <time className="flex-none text-xs font-medium text-zinc-400 dark:text-zinc-500" dateTime={item.task.createdAt}>
                    {formatDateTime(item.task.createdAt, locale)}
                  </time>
                </div>

                {item.task.error ? (
                  <div className="flex items-start gap-2 rounded-xl border border-zinc-200/60 bg-zinc-50/50 p-2.5 text-xs text-zinc-600 dark:border-zinc-800/60 dark:bg-zinc-900/40 dark:text-zinc-400">
                    <AlertCircle className="mt-0.5 size-3.5 flex-none text-zinc-400 dark:text-zinc-500" />
                    <span className="break-all font-medium leading-relaxed">{item.task.error.message}</span>
                  </div>
                ) : null}

                {resources.length > 0 ? (
                  <>
                    <button
                      aria-label={m.workflow_canvas_select_output({
                        label: displayResource?.role ?? displayResource?.kind ?? '',
                        index: (displayResource?.index ?? 0) + 1,
                      })}
                      aria-pressed={Boolean(selectedResource)}
                      className={cn(historyPreviewClassName, selectedResource && historyPreviewSelectedClassName)}
                      onClick={() => {
                        if (!displayResource) {
                          return
                        }
                        setNodeMediaView(nodeId, {
                          taskId: item.task.id,
                          outputResourceId: displayResource.id,
                          outputIndex: displayResource.index,
                        })
                      }}
                      type="button"
                    >
                      {previewResource?.kind === 'image' && previewUrl ? (
                        <img alt="" className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.015]" loading="lazy" src={previewUrl} />
                      ) : previewResource?.kind === 'video' ? (
                        <div className="absolute inset-0 grid place-items-center bg-zinc-100 dark:bg-zinc-900 text-zinc-400 dark:text-zinc-500">
                          <Clapperboard aria-hidden="true" size={20} />
                        </div>
                      ) : (
                        <span className={historyPlaceholderClassName}>{m.workflow_canvas_history_no_output()}</span>
                      )}
                    </button>
                    {resources.length > 1 ? (
                      <div className={outputStripClassName}>
                        {resources.map((resource) => {
                          const thumbResource = historyThumbnailResource(item.task.output, resource)
                          const thumbUrl = previewUrlForMedia(thumbResource)
                          const selected =
                            mediaView?.taskId === item.task.id &&
                            (mediaView.outputResourceId ? mediaView.outputResourceId === resource.id : mediaView.outputIndex === resource.index)
                          return (
                            <button
                              aria-label={m.workflow_canvas_select_output({ label: resource.role ?? resource.kind, index: resource.index + 1 })}
                              aria-pressed={selected}
                              className={thumbButtonClassName}
                              key={resource.id}
                              onClick={() =>
                                setNodeMediaView(nodeId, {
                                  taskId: item.task.id,
                                  outputResourceId: resource.id,
                                  outputIndex: resource.index,
                                })
                              }
                              type="button"
                            >
                              {thumbResource?.kind === 'image' && thumbUrl ? (
                                <img alt="" className="size-full object-cover transition-all duration-200" loading="lazy" src={thumbUrl} />
                              ) : thumbResource?.kind === 'video' ? (
                                <Clapperboard aria-hidden="true" size={14} />
                              ) : (
                                <span>{resource.role === 'generated_video' ? 'V' : resource.index + 1}</span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 px-3 py-2 text-center text-xs font-semibold text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-500">
                    {active ? m.workflow_canvas_history_waiting_output() : m.workflow_canvas_history_no_output()}
                  </div>
                )}
              </article>
            )
          })}
          {query.data?.items.length === 0 ? (
            <div className={emptyClassName}>{m.workflow_canvas_no_tasks()}</div>
          ) : null}
        </div>
      </section>
    </Panel>
  )
}
