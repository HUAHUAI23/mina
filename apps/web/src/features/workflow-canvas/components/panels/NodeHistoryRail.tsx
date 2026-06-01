import { Panel } from '@xyflow/react'
import { useQuery } from '@tanstack/react-query'
import { Check, Clapperboard, Loader2, X } from 'lucide-react'
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
const railShellClassName = 'grid max-h-[min(78dvh,46rem)] w-[26.5rem] min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-3 overflow-hidden rounded-2xl bg-surface-container-lowest/96 p-4 shadow-floating ring-1 ring-inset ring-outline-ghost'
const railHeaderClassName = 'flex items-start justify-between gap-3'
const closeButtonClassName = 'flex size-8 flex-none items-center justify-center rounded-full border-0 bg-surface-container-low p-0 text-foreground-tertiary hover:bg-surface-container-high hover:text-foreground'
const followButtonClassName = 'group flex min-h-11 items-center justify-between gap-3 rounded-2xl border-0 bg-surface-container-low px-3.5 py-2.5 text-left text-sm font-bold text-foreground-secondary hover:bg-surface-container aria-pressed:bg-surface-container-high aria-pressed:text-foreground'
const listClassName = 'grid min-h-0 content-start gap-2.5 overflow-auto pr-1 [scrollbar-gutter:stable]'
const taskCardClassName = 'group grid min-w-0 gap-2.5 py-1'
const statusDotClassName = 'size-1.5 rounded-full bg-foreground-faint'
const statusDotActiveClassName = 'bg-brand-accent'
const historyPreviewClassName = 'relative flex aspect-[16/10] w-full min-w-0 items-center justify-center overflow-hidden rounded-2xl border-0 bg-transparent p-0 text-xs font-black text-foreground-tertiary shadow-[0_28px_58px_-34px_color-mix(in_oklch,var(--foreground)_30%,transparent),inset_0_0_0_1px_color-mix(in_oklch,var(--foreground-quaternary)_12%,transparent)]'
const historyPreviewSelectedClassName = 'shadow-[0_30px_60px_-34px_color-mix(in_oklch,var(--foreground)_30%,transparent),inset_0_0_0_2px_color-mix(in_oklch,var(--primary)_58%,var(--foreground-secondary))]'
const outputStripClassName = 'flex max-w-full gap-2 overflow-x-auto px-0.5'
const thumbButtonClassName = 'relative flex size-9 flex-none items-center justify-center overflow-hidden rounded-md border-0 bg-surface-container-lowest/76 p-0 text-xs font-black text-foreground-tertiary opacity-72 shadow-[0_10px_24px_-22px_color-mix(in_oklch,var(--foreground)_24%,transparent),inset_0_0_0_1px_color-mix(in_oklch,var(--foreground-quaternary)_10%,transparent)] hover:opacity-100 aria-pressed:opacity-100 aria-pressed:shadow-[0_12px_26px_-22px_color-mix(in_oklch,var(--foreground)_26%,transparent),inset_0_0_0_2px_color-mix(in_oklch,var(--primary)_58%,var(--foreground-secondary))]'
const selectedBadgeClassName = 'absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_16px_-10px_color-mix(in_oklch,var(--foreground)_30%,transparent)]'
const emptyClassName = 'grid min-h-32 place-items-center rounded-2xl bg-surface-container-low p-5 text-center text-sm font-bold text-foreground-quaternary'
const historyPlaceholderClassName = 'absolute inset-0 grid place-items-center bg-surface-container-high text-center text-xs font-bold text-foreground-quaternary'

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
          <div className="grid min-w-0 gap-1">
            <span className="text-xs leading-none font-black tracking-[0.22em] text-foreground-quaternary uppercase">
              {m.workflow_canvas_history_eyebrow()}
            </span>
            <strong className="font-display text-xl leading-tight text-foreground">{m.workflow_canvas_task_history()}</strong>
            <span className="text-xs font-bold text-foreground-tertiary">
              {m.workflow_canvas_history_count({ count: query.data?.items.length ?? 0 })}
            </span>
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
            <span>{isFollowingLatest ? m.workflow_canvas_following_latest() : m.workflow_canvas_follow_latest()}</span>
            <span className="text-xs font-bold text-foreground-quaternary group-aria-pressed:text-foreground-tertiary">
              {m.workflow_canvas_history_follow_hint()}
            </span>
          </span>
          <span className="grid size-6 flex-none place-items-center rounded-full bg-surface-container-lowest text-foreground-tertiary group-aria-pressed:bg-primary group-aria-pressed:text-primary-foreground">
            {isFollowingLatest ? <Check aria-hidden="true" size={14} /> : <Loader2 aria-hidden="true" size={13} />}
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
            return (
              <article className={taskCardClassName} key={`${item.workflowRunId}:${item.task.id}`}>
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={cn(statusDotClassName, active && statusDotActiveClassName)} aria-hidden="true" />
                    <strong className="truncate text-sm leading-5 text-foreground">{pendingLabel}</strong>
                  </div>
                  <time className="flex-none pt-0.5 text-xs font-bold text-foreground-quaternary" dateTime={item.task.createdAt}>
                    {formatDateTime(item.task.createdAt, locale)}
                  </time>
                </div>
                {item.task.error ? <p className="m-0 text-xs font-bold text-destructive">{item.task.error.message}</p> : null}
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
                        <img alt="" className="absolute inset-0 size-full object-cover" loading="lazy" src={previewUrl} />
                      ) : previewResource?.kind === 'video' ? (
                        <Clapperboard aria-hidden="true" size={18} />
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
                                <img alt="" className="size-full object-cover" loading="lazy" src={thumbUrl} />
                              ) : thumbResource?.kind === 'video' ? (
                                <Clapperboard aria-hidden="true" size={16} />
                              ) : (
                                <span>{resource.role === 'generated_video' ? 'V' : resource.index + 1}</span>
                              )}
                              {selected ? (
                                <span className={selectedBadgeClassName}>
                                  <Check aria-hidden="true" size={11} />
                                </span>
                              ) : null}
                            </button>
                          )
                        })}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="rounded-xl bg-surface-container-lowest px-3 py-2 text-xs font-bold text-foreground-quaternary">
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
