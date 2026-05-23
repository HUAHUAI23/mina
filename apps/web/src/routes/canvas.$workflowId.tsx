import { lazy, Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import '../features/workflow-canvas/workflow-canvas.css'

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
    <Suspense fallback={<div className="grid h-dvh w-screen place-items-center overflow-hidden bg-surface text-foreground"><div className="p-2.5 text-[0.74rem] font-bold text-foreground-quaternary">Loading workflow</div></div>}>
      <WorkflowCanvasPage workflowId={workflowId} />
    </Suspense>
  )
}
