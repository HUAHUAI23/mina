import { createApp } from '../app/create-app'
import { AccountManagementService } from '../modules/accounts/account-management.service'
import { AccountsService } from '../modules/accounts/accounts.service'
import { MediaObjectService } from '../modules/media/media-object.service'
import { PricingService } from '../modules/pricing/pricing.service'
import { TaskConfigAssembler } from '../modules/tasks/config/task-config-assembler'
import { TaskModelCatalogService } from '../modules/tasks/models/model-catalog.service'
import { ModelRegistry } from '../modules/tasks/models/model-registry'
import { ProviderRouter } from '../modules/tasks/models/provider-router'
import { registerTaskModels } from '../modules/tasks/models/register-models'
import { OutputPostProcessor } from '../modules/tasks/output/output-post-processor'
import { TaskOutputFinalizer } from '../modules/tasks/output/task-output-finalizer'
import { DeterministicVideoFrameGenerator } from '../modules/tasks/output/video-frame-generator'
import { MediaResolvingTaskProvider } from '../modules/tasks/providers/media-resolving-task-provider'
import { ProviderMediaUrlResolver } from '../modules/tasks/providers/provider-media-url-resolver'
import { TasksService } from '../modules/tasks/tasks.service'
import { WorkflowMediaResolver } from '../modules/workflows/media/workflow-media-resolver'
import { InMemoryWorkflowEventBus } from '../modules/workflows/workflow-event-bus'
import { BusWorkflowRunEventPublisher } from '../modules/workflows/workflow-run-event-publisher'
import { WorkflowsService } from '../modules/workflows/workflows.service'
import {
  FakeAccountsRepository,
  FakeMediaObjectRepository,
  FakeObjectStorage,
  FakePricingRepository,
  FakeProjectRepository,
  FakeTaskEventLog,
  FakeTaskRepository,
  FakeWorkflowDefinitionRepository,
  FakeWorkflowNodeTaskRepository,
  FakeWorkflowRunEventLog,
  FakeWorkflowRunRepository,
  FakeWorkflowYjsRepository,
} from './fakes'
import { WorkflowYjsRoomService } from '../modules/workflows/collaboration/workflow-yjs-room.service'
import { ProjectsService } from '../modules/projects/projects.service'

export const createTestApp = () => {
  const accountsRepository = new FakeAccountsRepository()
  const storage = new FakeObjectStorage()
  const taskRepository = new FakeTaskRepository()
  const mediaObjectService = new MediaObjectService(
    new FakeMediaObjectRepository(),
    storage,
    {
      fetch: async () => {
        throw new Error('fetcher not configured')
      },
    },
  )
  const modelRegistry = registerTaskModels(new ModelRegistry())
  const modelCatalogService = new TaskModelCatalogService(modelRegistry)
  const pricingService = new PricingService(new FakePricingRepository())
  const tasksService = new TasksService(
    taskRepository,
    pricingService,
    new MediaResolvingTaskProvider(
      new ProviderRouter(modelRegistry),
      new ProviderMediaUrlResolver(mediaObjectService, 14_400),
    ),
    modelRegistry,
    new TaskOutputFinalizer(mediaObjectService),
    new OutputPostProcessor(new DeterministicVideoFrameGenerator(mediaObjectService)),
    new FakeTaskEventLog(),
  )
  const runs = new FakeWorkflowRunRepository()
  const nodeTasks = new FakeWorkflowNodeTaskRepository(runs, taskRepository)
  const workflowEventBus = new InMemoryWorkflowEventBus()
  const workflowDefinitions = new FakeWorkflowDefinitionRepository()
  const workflowYjsRoomService = new WorkflowYjsRoomService(
    new FakeWorkflowYjsRepository(),
    undefined,
    {
      onSnapshotSaved: async ({ timestamp, version, workflowId }) => {
        await workflowDefinitions.touch(workflowId, timestamp, version)
      },
    },
  )
  const workflowsService = new WorkflowsService(
    {
      definitions: workflowDefinitions,
      nodeStates: runs,
      nodeTasks,
      runs,
    },
    tasksService,
    new TaskConfigAssembler(modelRegistry),
    new WorkflowMediaResolver(mediaObjectService, tasksService),
    workflowYjsRoomService,
    new FakeWorkflowRunEventLog(),
    new BusWorkflowRunEventPublisher(workflowEventBus),
    workflowEventBus,
  )
  const projectsService = new ProjectsService(
    new FakeProjectRepository(workflowDefinitions),
    workflowDefinitions,
  )

  return createApp({
    accountManagementService: new AccountManagementService(accountsRepository, storage, mediaObjectService),
    accountsService: new AccountsService(accountsRepository),
    mediaObjectService,
    modelCatalogService,
    projectsService,
    storage,
    tasksService,
    workflowEventBus,
    workflowYjsRoomService,
    workflowsService,
  })
}
