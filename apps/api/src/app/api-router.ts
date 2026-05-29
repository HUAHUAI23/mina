import { Hono } from 'hono'

import { createAccountManagementRoutes } from '../modules/accounts/account-management.routes'
import type { AccountManagementService } from '../modules/accounts/account-management.service'
import { createAccountsRoutes } from '../modules/accounts/accounts.routes'
import type { AccountsService } from '../modules/accounts/accounts.service'
import { createHealthRoutes } from '../modules/health/health.routes'
import { createMediaRoutes } from '../modules/media/media.routes'
import type { MediaObjectService } from '../modules/media/media-object.service'
import { createProjectsRoutes } from '../modules/projects/projects.routes'
import type { ProjectsService } from '../modules/projects/projects.service'
import type { TaskModelCatalogService } from '../modules/tasks/models/model-catalog.service'
import { createTasksRoutes } from '../modules/tasks/tasks.routes'
import { createWorkflowRunsRoutes } from '../modules/workflows/workflow-runs.routes'
import { createWorkflowCollaborationRoutes } from '../modules/workflows/workflow-collaboration.routes'
import { createWorkflowEventsRoutes } from '../modules/workflows/workflow-events.routes'
import { createWorkflowsRoutes } from '../modules/workflows/workflows.routes'
import type { WorkflowEventBus } from '../modules/workflows/workflow-event-bus'
import type { WorkflowYjsRoomService } from '../modules/workflows/collaboration/workflow-yjs-room.service'
import type { TasksService } from '../modules/tasks/tasks.service'
import type { WorkflowsService } from '../modules/workflows/workflows.service'

export interface ApiRouterDependencies {
  accountManagementService: AccountManagementService
  accountsService: AccountsService
  mediaObjectService: MediaObjectService
  modelCatalogService: TaskModelCatalogService
  projectsService: ProjectsService
  tasksService: TasksService
  workflowEventBus: WorkflowEventBus
  workflowYjsRoomService: WorkflowYjsRoomService
  workflowsService: WorkflowsService
}

export const createApiRouter = ({
  accountManagementService,
  accountsService,
  mediaObjectService,
  modelCatalogService,
  projectsService,
  tasksService,
  workflowEventBus,
  workflowYjsRoomService,
  workflowsService,
}: ApiRouterDependencies): Hono =>
  new Hono()
    .basePath('/api')
    .route('/account', createAccountManagementRoutes(accountManagementService, accountsService))
    .route('/auth', createAccountsRoutes(accountsService))
    .route('/health', createHealthRoutes())
    .route('/', createMediaRoutes(mediaObjectService, accountsService))
    .route('/projects', createProjectsRoutes(projectsService, accountsService))
    .route('/tasks', createTasksRoutes(tasksService, modelCatalogService, accountsService))
    .route('/workflows', createWorkflowsRoutes(workflowsService, accountsService))
    .route('/workflows', createWorkflowCollaborationRoutes(workflowsService, accountsService, workflowYjsRoomService))
    .route('/workflows', createWorkflowEventsRoutes(workflowEventBus))
    .route('/workflow-runs', createWorkflowRunsRoutes(workflowsService, accountsService))
