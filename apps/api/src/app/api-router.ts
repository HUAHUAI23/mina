import { Hono } from 'hono'

import { createHealthRoutes } from '../modules/health/health.routes'
import { createPostsRoutes } from '../modules/posts/posts.routes'
import type { PostsService } from '../modules/posts/posts.service'
import { createTasksRoutes } from '../modules/tasks/tasks.routes'
import { createWorkflowRunsRoutes, createWorkflowsRoutes } from '../modules/workflows/workflows.routes'
import type { TasksService } from '../modules/tasks/tasks.service'
import type { WorkflowsService } from '../modules/workflows/workflows.service'

export interface ApiRouterDependencies {
  postsService: PostsService
  tasksService: TasksService
  workflowsService: WorkflowsService
}

export const createApiRouter = ({
  postsService,
  tasksService,
  workflowsService,
}: ApiRouterDependencies): Hono =>
  new Hono()
    .basePath('/api')
    .route('/health', createHealthRoutes())
    .route('/posts', createPostsRoutes(postsService))
    .route('/tasks', createTasksRoutes(tasksService))
    .route('/workflows', createWorkflowsRoutes(workflowsService))
    .route('/workflow-runs', createWorkflowRunsRoutes(workflowsService))
