import { useQuery } from '@tanstack/react-query'
import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

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
  const query = useQuery({
    enabled: open && (node.data.nodeType === 'image_generation' || node.data.nodeType === 'video_generation'),
    queryFn: () => listNodeTasks(workflowId, node.id),
    queryKey: workflowKeys.nodeTasks(workflowId, node.id),
  })

  return (
    <section className="mina-wc-history-card">
      <div className="mina-wc-panel-heading">
        <strong>Task History</strong>
        <span>{query.data?.items.length ?? 0}</span>
      </div>
      <div className="mina-wc-history-list">
        {query.data?.items.map((item) => {
          const resources = selectableResources(item.task.output)
          return (
            <article className="mina-wc-history-item" key={`${item.workflowRunId}:${item.task.id}`}>
              <div>
                <strong>{item.task.status}</strong>
                <span>{new Date(item.task.createdAt).toLocaleString()}</span>
              </div>
              {item.task.error ? <p>{item.task.error.message}</p> : null}
              <div className="mina-wc-history-resources">
                {resources.map((resource) => {
                  const previewUrl = previewUrlForMedia(resource)
                  return (
                    <button
                      aria-label={`Select ${resource.role ?? resource.kind} ${resource.index + 1}`}
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
                        <img alt="" loading="lazy" src={previewUrl} />
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
        {query.data?.items.length === 0 ? <div className="mina-wc-panel-empty">No tasks yet</div> : null}
      </div>
    </section>
  )
}
