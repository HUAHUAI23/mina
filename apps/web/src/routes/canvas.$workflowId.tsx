import { lazy, Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/canvas/$workflowId')({
  component: WorkflowCanvasRoute,
})

const WorkflowCanvasPage = lazy(() =>
  import('../features/workflow-canvas/components/WorkflowCanvasPage').then((module) => ({
    default: module.WorkflowCanvasPage,
  })),
)

function WorkflowCanvasRoute() {
  const { workflowId } = Route.useParams()
  return (
    <Suspense fallback={<div className="mina-wc-page"><div className="mina-wc-loading">Loading workflow</div></div>}>
      <WorkflowCanvasPage workflowId={workflowId} />
    </Suspense>
  )
}
