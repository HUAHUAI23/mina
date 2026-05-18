import { Hono } from 'hono'

import { createAccountsRoutes } from '../modules/accounts/accounts.routes'
import type { AccountsService } from '../modules/accounts/accounts.service'
import { createHealthRoutes } from '../modules/health/health.routes'
import { createTasksRoutes } from '../modules/tasks/tasks.routes'
import { createWorkflowRunsRoutes } from '../modules/workflows/workflow-runs.routes'
import { createWorkflowsRoutes } from '../modules/workflows/workflows.routes'
import type { TasksService } from '../modules/tasks/tasks.service'
import type { WorkflowsService } from '../modules/workflows/workflows.service'

export interface ApiRouterDependencies {
  accountsService: AccountsService
  tasksService: TasksService
  workflowsService: WorkflowsService
}

export const createApiRouter = ({
  accountsService,
  tasksService,
  workflowsService,
}: ApiRouterDependencies): Hono =>
  new Hono()
    .basePath('/api')
    .route('/auth', createAccountsRoutes(accountsService))
    .route('/health', createHealthRoutes())
    .route('/tasks', createTasksRoutes(tasksService))
    .route('/workflows', createWorkflowsRoutes(workflowsService))
    .route('/workflow-runs', createWorkflowRunsRoutes(workflowsService))
