import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'

import { createWorkflow, listWorkflows } from '../api/workflow-list.client'
import { workflowKeys } from '../../workflow-canvas/api/workflow-keys'

export function CanvasPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const workflowsQuery = useQuery({ queryFn: listWorkflows, queryKey: workflowKeys.list() })
  const createMutation = useMutation({
    mutationFn: () => createWorkflow({ name: 'Untitled Workflow', nodes: [], edges: [] }),
    onSuccess: (response) => {
      void queryClient.invalidateQueries({ queryKey: workflowKeys.list() })
      void navigate({ to: '/canvas/$workflowId', params: { workflowId: response.item.id } })
    },
  })

  return (
    <div className="mina-canvas-page">
      <section className="mina-canvas-section" aria-label="Canvases">
        <div className="mina-recent-canvas-grid">
          {workflowsQuery.data?.items.map((workflow) => (
            <Link className="mina-recent-canvas-card" key={workflow.id} params={{ workflowId: workflow.id }} to="/canvas/$workflowId">
              <div className="mina-recent-preview" data-tone="wave" />
              <div>
                <h3>{workflow.name}</h3>
                <p>{new Date(workflow.updatedAt).toLocaleString()}</p>
              </div>
            </Link>
          ))}

          <button className="mina-new-canvas-card" disabled={createMutation.isPending} onClick={() => createMutation.mutate()} type="button">
            <span>
              <Plus aria-hidden="true" size={24} />
            </span>
            New Canvas
          </button>
        </div>
      </section>
    </div>
  )
}
