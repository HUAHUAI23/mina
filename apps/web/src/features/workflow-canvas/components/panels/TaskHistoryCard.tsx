import { useQuery } from '@tanstack/react-query'
import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import { cn } from '@mina/ui/lib/utils'

import { workflowKeys } from '../../api/workflow-keys'
import { listNodeTasks } from '../../api/workflow-queries'
import { selectableResources } from '../../utils/media-view'
import { previewUrlForMedia } from '../../utils/media-url'
import { useCanvasStore } from '../../store/canvas-store'

interface TaskHistoryCardProps {
  node: WorkflowCanvasNode
  open: boolean
  workflowId: string
}

export function TaskHistoryCard({ node, open, workflowId }: TaskHistoryCardProps) {
  const setNodeMediaView = useCanvasStore((state) => state.setNodeMediaView)
  const mediaView = node.data.nodeType === 'image_generation' || node.data.nodeType === 'video_generation'
    ? node.data.mediaView
    : undefined
  const query = useQuery({
    enabled: open && (node.data.nodeType === 'image_generation' || node.data.nodeType === 'video_generation'),
    queryFn: () => listNodeTasks(workflowId, node.id),
    queryKey: workflowKeys.nodeTasks(workflowId, node.id),
  })

  return (
    <section className="grid min-h-0 gap-3 overflow-auto rounded-2xl bg-surface-container-lowest/90 p-4 shadow-floating">
      <div className="flex items-center justify-between">
        <strong className="text-[0.84rem] text-foreground">Task History</strong>
        <span className="text-[0.66rem] font-extrabold text-foreground-tertiary">{query.data?.items.length ?? 0}</span>
      </div>
      <div className="grid gap-2.5">
        {query.data?.items.map((item) => {
          const resources = selectableResources(item.task.output)
          return (
            <article className="grid gap-2 rounded-xl bg-surface-container-low p-2.5" key={`${item.workflowRunId}:${item.task.id}`}>
              <div className="flex items-center justify-between">
                <strong className="text-[0.84rem] text-foreground">{item.task.status}</strong>
                <span className="text-[0.66rem] font-extrabold text-foreground-tertiary">{new Date(item.task.createdAt).toLocaleString()}</span>
              </div>
              {item.task.error ? <p className="m-0 text-[0.74rem] text-destructive">{item.task.error.message}</p> : null}
              <div className="flex min-w-0 gap-1.5 overflow-x-auto">
                {resources.map((resource) => {
                  const previewUrl = previewUrlForMedia(resource)
                  const selected =
                    mediaView?.taskId === item.task.id &&
                    (mediaView.outputResourceId ? mediaView.outputResourceId === resource.id : mediaView.outputIndex === resource.index)
                  const disabled = item.task.status === 'failed'
                  return (
                    <button
                      aria-label={`Select ${resource.role ?? resource.kind} ${resource.index + 1}`}
                      aria-pressed={selected}
                      className={cn(
                        'flex h-10 w-11 flex-none items-center justify-center overflow-hidden rounded-md border-0 bg-surface-container-lowest p-0 text-foreground-tertiary',
                        'hover:shadow-[inset_0_0_0_1.5px_color-mix(in_oklch,var(--foreground-secondary)_48%,transparent)]',
                        selected && 'shadow-[inset_0_0_0_2px_color-mix(in_oklch,var(--primary)_64%,var(--foreground-secondary))]',
                        disabled && 'cursor-not-allowed opacity-45',
                      )}
                      disabled={disabled}
                      key={resource.id}
                      onClick={() =>
                        setNodeMediaView(node.id, {
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
                        <span>{resource.index + 1}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </article>
          )
        })}
        {query.data?.items.length === 0 ? <div className="p-2.5 text-[0.74rem] font-bold text-foreground-quaternary">No tasks yet</div> : null}
      </div>
    </section>
  )
}
