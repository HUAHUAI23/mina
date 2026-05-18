import { Hono } from 'hono'

import { createAccountsRoutes } from '../modules/accounts/accounts.routes'
import type { AccountsService } from '../modules/accounts/accounts.service'
import { createHealthRoutes } from '../modules/health/health.routes'
import { createMediaRoutes } from '../modules/media/media.routes'
import type { MediaObjectService } from '../modules/media/media-object.service'
import type { TaskModelCatalogService } from '../modules/tasks/models/model-catalog.service'
import { createTasksRoutes } from '../modules/tasks/tasks.routes'
import { createWorkflowRunsRoutes } from '../modules/workflows/workflow-runs.routes'
import { createWorkflowEventsRoutes } from '../modules/workflows/workflow-events.routes'
import { createWorkflowsRoutes } from '../modules/workflows/workflows.routes'
import type { WorkflowEventBus } from '../modules/workflows/workflow-event-bus'
import type { TasksService } from '../modules/tasks/tasks.service'
import type { WorkflowsService } from '../modules/workflows/workflows.service'

export interface ApiRouterDependencies {
  accountsService: AccountsService
  mediaObjectService: MediaObjectService
  modelCatalogService: TaskModelCatalogService
  tasksService: TasksService
  workflowEventBus: WorkflowEventBus
  workflowsService: WorkflowsService
}

export const createApiRouter = ({
  accountsService,
  mediaObjectService,
  modelCatalogService,
  tasksService,
  workflowEventBus,
  workflowsService,
}: ApiRouterDependencies): Hono =>
  new Hono()
    .basePath('/api')
    .route('/auth', createAccountsRoutes(accountsService))
    .route('/health', createHealthRoutes())
    .route('/', createMediaRoutes(mediaObjectService, accountsService))
    .route('/tasks', createTasksRoutes(tasksService, modelCatalogService, accountsService))
    .route('/workflows', createWorkflowsRoutes(workflowsService, accountsService))
    .route('/workflows', createWorkflowEventsRoutes(workflowEventBus))
    .route('/workflow-runs', createWorkflowRunsRoutes(workflowsService, accountsService))
