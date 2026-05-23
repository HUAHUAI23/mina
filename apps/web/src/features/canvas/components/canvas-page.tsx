import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'

import { cn } from '@mina/ui/lib/utils'

import { createWorkflow, listWorkflows } from '../api/workflow-list.client'
import { workflowKeys } from '../../workflow-canvas/api/workflow-keys'
import '../canvas-page.css'

const pageClassName = 'grid min-h-0 min-w-0 content-start gap-[22px] overflow-y-auto [scrollbar-gutter:stable] py-[clamp(18px,3dvh,34px)] px-1 pb-[18px]'
const gridClassName = 'grid items-start justify-start gap-[26px] [grid-template-columns:repeat(auto-fill,178px)] max-lg:[grid-template-columns:repeat(auto-fill,minmax(164px,1fr))] max-md:grid-cols-1'
const newCanvasCardClassName = 'flex min-h-[252px] min-w-0 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-outline-ghost bg-transparent font-extrabold text-foreground-tertiary hover:border-foreground-quaternary hover:text-foreground'

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
    <div className={pageClassName}>
      <section className="grid gap-5" aria-label="Canvases">
        <div className={gridClassName}>
          {workflowsQuery.data?.items.map((workflow) => (
            <Link
              className="h-[252px] min-w-0 overflow-hidden rounded-2xl bg-surface-container-lowest shadow-floating"
              key={workflow.id}
              params={{ workflowId: workflow.id }}
              to="/canvas/$workflowId"
            >
              <div className="mina-canvas-list-preview relative min-h-[158px] overflow-hidden" />
              <div className="p-4">
                <h3 className="font-display m-0 text-[0.96rem] leading-[1.18] text-foreground">{workflow.name}</h3>
                <p className="mt-2 text-[0.66rem] uppercase text-foreground-tertiary">{new Date(workflow.updatedAt).toLocaleString()}</p>
              </div>
            </Link>
          ))}

          <button
            className={cn(
              newCanvasCardClassName,
              createMutation.isPending && 'cursor-not-allowed opacity-60',
            )}
            disabled={createMutation.isPending}
            onClick={() => createMutation.mutate()}
            type="button"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-container-lowest">
              <Plus aria-hidden="true" size={24} />
            </span>
            New Canvas
          </button>
        </div>
      </section>
    </div>
  )
}
