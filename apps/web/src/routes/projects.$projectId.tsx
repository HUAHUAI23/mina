import { createFileRoute } from '@tanstack/react-router'

import { ProjectDetailPage } from '../features/projects/components/projects-page'

export const Route = createFileRoute('/projects/$projectId')({
  component: ProjectDetailRoute,
})

function ProjectDetailRoute() {
  const { projectId } = Route.useParams()
  return <ProjectDetailPage projectId={projectId} />
}
