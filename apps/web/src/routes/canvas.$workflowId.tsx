import { lazy, Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { useMessages } from '../app/i18n-provider'
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
    <Suspense fallback={<CanvasRouteFallback />}>
      <WorkflowCanvasPage workflowId={workflowId} />
    </Suspense>
  )
}

function CanvasRouteFallback() {
  const m = useMessages()

  return (
    <div className="grid h-dvh w-screen place-items-center overflow-hidden bg-surface text-foreground">
      <div className="p-2.5 text-xs font-normal text-foreground-quaternary">{m.workflow_canvas_loading()}</div>
    </div>
  )
}
