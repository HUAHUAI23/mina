import { Panel } from '@xyflow/react'
import { useQuery } from '@tanstack/react-query'
import { Check, X } from 'lucide-react'
import type { TaskStatus } from '@mina/contracts/modules/tasks'
import { formatDateTime } from '@mina/i18n'
import { cn } from '@mina/ui/lib/utils'

import { useI18n, useMessages } from '../../../../app/i18n-provider'
import { workflowKeys } from '../../api/workflow-keys'
import { listNodeTasks } from '../../api/workflow-queries'
import { isMediaGenerationNode } from '../../domain/canvas-node-types'
import { selectableResources } from '../../utils/media-view'
import { previewUrlForMedia } from '../../utils/media-url'
import { useCanvasStore } from '../../store/canvas-store'
import { useCanvasUiStore } from '../../store/canvas-ui-store'
import { useNodeRuntimeStore } from '../../store/node-runtime-store'
import { useCanvasNode, useCanvasWorkflowId } from '../../store/selectors'

const railPanelClassName = 'mina-wc-history-rail nodrag nowheel nopan pointer-events-auto'
const railShellClassName = 'grid max-h-[min(76dvh,720px)] w-[300px] min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-3 overflow-hidden rounded-2xl bg-surface-container-lowest/95 p-4 shadow-[0_30px_66px_-38px_color-mix(in_oklch,var(--foreground)_28%,transparent),inset_0_0_0_1px_color-mix(in_oklch,var(--foreground-quaternary)_8%,transparent)]'
const railHeaderClassName = 'flex items-center justify-between gap-2'
const closeButtonClassName = 'flex size-7 flex-none items-center justify-center rounded-md border-0 bg-transparent p-0 text-foreground-tertiary hover:bg-surface-container-high hover:text-foreground'
const followButtonClassName = 'flex items-center justify-between gap-2 rounded-xl border-0 bg-surface-container-low px-3 py-2 text-left text-[0.78rem] font-bold text-foreground-secondary hover:bg-surface-container aria-pressed:bg-[color-mix(in_oklch,var(--primary)_18%,var(--surface-container-low))] aria-pressed:text-foreground'
const listClassName = 'grid min-h-0 gap-2.5 overflow-auto'
const taskCardClassName = 'grid gap-2 rounded-xl bg-surface-container-low p-2.5'
const thumbButtonClassName = 'flex h-12 w-11 flex-none items-center justify-center overflow-hidden rounded-md border-0 bg-surface-container-lowest p-0 text-foreground-tertiary hover:shadow-[inset_0_0_0_1.5px_color-mix(in_oklch,var(--foreground-secondary)_48%,transparent)]'
const thumbSelectedClassName = 'shadow-[inset_0_0_0_2px_color-mix(in_oklch,var(--primary)_64%,var(--foreground-secondary))]'

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
      return ''
  }
}

/**
 * Left-docked rail listing a media node's task history. Selecting a thumbnail pins the node's
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
    <Panel position="top-left" className={railPanelClassName} data-mina-canvas-ignore="true" data-mina-canvas-panel-root="true">
      <section className={railShellClassName} aria-label={m.workflow_canvas_task_history()}>
        <div className={railHeaderClassName}>
          <strong className="text-[0.84rem] text-foreground">{m.workflow_canvas_task_history()}</strong>
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
          <span>{m.workflow_canvas_follow_latest()}</span>
          {isFollowingLatest ? <Check aria-hidden="true" size={14} /> : null}
        </button>

        <div className={listClassName}>
          {query.data?.items.map((item) => {
            const resources = selectableResources(item.task.output)
            const liveStatus = runtime?.taskStatuses[item.task.id] ?? item.task.status
            const pendingLabel = statusLabel(liveStatus, m)
            return (
              <article className={taskCardClassName} key={`${item.workflowRunId}:${item.task.id}`}>
                <div className="flex items-center justify-between">
                  <strong className="text-[0.78rem] text-foreground">{pendingLabel || m.workflow_canvas_task_history()}</strong>
                  <span className="text-[0.64rem] font-extrabold text-foreground-tertiary">{formatDateTime(item.task.createdAt, locale)}</span>
                </div>
                {item.task.error ? <p className="m-0 text-[0.72rem] text-destructive">{item.task.error.message}</p> : null}
                {resources.length > 0 ? (
                  <div className="flex min-w-0 flex-wrap gap-1.5">
                    {resources.map((resource) => {
                      const previewUrl = previewUrlForMedia(resource)
                      const selected =
                        mediaView?.taskId === item.task.id &&
                        (mediaView.outputResourceId ? mediaView.outputResourceId === resource.id : mediaView.outputIndex === resource.index)
                      return (
                        <button
                          aria-label={m.workflow_canvas_select_output({ label: resource.role ?? resource.kind, index: resource.index + 1 })}
                          aria-pressed={selected}
                          className={cn(thumbButtonClassName, selected && thumbSelectedClassName)}
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
                          {resource.kind === 'image' && previewUrl ? (
                            <img alt="" className="size-full object-cover" loading="lazy" src={previewUrl} />
                          ) : (
                            <span>{resource.role === 'generated_video' ? 'V' : resource.index + 1}</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </article>
            )
          })}
          {query.data?.items.length === 0 ? (
            <div className="p-2.5 text-[0.74rem] font-bold text-foreground-quaternary">{m.workflow_canvas_no_tasks()}</div>
          ) : null}
        </div>
      </section>
    </Panel>
  )
}
