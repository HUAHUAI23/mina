import { createApp } from '../app/create-app'
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
import { TasksService } from '../modules/tasks/tasks.service'
import { WorkflowMediaResolver } from '../modules/workflows/media/workflow-media-resolver'
import { InMemoryWorkflowEventBus } from '../modules/workflows/workflow-event-bus'
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
  const taskRepository = new FakeTaskRepository()
  const mediaObjectService = new MediaObjectService(
    new FakeMediaObjectRepository(),
    new FakeObjectStorage(),
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
    new ProviderRouter(modelRegistry),
    modelRegistry,
    new TaskOutputFinalizer(mediaObjectService),
    new OutputPostProcessor(new DeterministicVideoFrameGenerator(mediaObjectService)),
    new FakeTaskEventLog(),
  )
  const runs = new FakeWorkflowRunRepository()
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
      nodeTasks: new FakeWorkflowNodeTaskRepository(runs),
      runs,
    },
    tasksService,
    new TaskConfigAssembler(modelRegistry),
    new WorkflowMediaResolver(mediaObjectService, tasksService),
    workflowYjsRoomService,
    new FakeWorkflowRunEventLog(),
    workflowEventBus,
  )
  const projectsService = new ProjectsService(
    new FakeProjectRepository(workflowDefinitions),
    workflowDefinitions,
  )

  return createApp({
    accountsService: new AccountsService(accountsRepository),
    mediaObjectService,
    modelCatalogService,
    projectsService,
    storage: new FakeObjectStorage(),
    tasksService,
    workflowEventBus,
    workflowYjsRoomService,
    workflowsService,
  })
}
