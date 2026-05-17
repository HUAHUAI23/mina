import { createFileRoute } from '@tanstack/react-router'

import { ProjectsPage } from '../features/projects/components/projects-page'

export const Route = createFileRoute('/projects')({
  component: ProjectsPage,
})
