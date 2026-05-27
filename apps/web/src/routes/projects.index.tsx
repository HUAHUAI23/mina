import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { ProjectsPage } from '../features/projects/components/projects-page'

const ProjectsSearchSchema = z.object({
  action: z.enum(['create-canvas']).optional(),
})

export const Route = createFileRoute('/projects/')({
  component: ProjectsIndexRoute,
  validateSearch: (search) => ProjectsSearchSchema.parse(search),
})

function ProjectsIndexRoute() {
  const search = Route.useSearch()
  return <ProjectsPage initialAction={search.action} />
}
