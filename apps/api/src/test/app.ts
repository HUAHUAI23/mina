import { createApp } from '../app/create-app'
import { AccountsService } from '../modules/accounts/accounts.service'
import { createDefaultUser } from '../modules/accounts/accounts.data'
import { MediaObjectService } from '../modules/media/media-object.service'
import { PricingService } from '../modules/pricing/pricing.service'
import { TaskConfigAssembler } from '../modules/tasks/config/task-config-assembler'
import { ModelRegistry } from '../modules/tasks/models/model-registry'
import { ProviderRouter } from '../modules/tasks/models/provider-router'
import { registerTaskModels } from '../modules/tasks/models/register-models'
import { OutputPostProcessor } from '../modules/tasks/output/output-post-processor'
import { TaskOutputFinalizer } from '../modules/tasks/output/task-output-finalizer'
import { DeterministicVideoFrameGenerator } from '../modules/tasks/output/video-frame-generator'
import { TasksService } from '../modules/tasks/tasks.service'
import { WorkflowMediaResolver } from '../modules/workflows/media/workflow-media-resolver'
import { WorkflowsService } from '../modules/workflows/workflows.service'
import {
  FakeAccountsRepository,
  FakeMediaObjectRepository,
  FakeObjectStorage,
  FakePricingRepository,
  FakeTaskEventLog,
  FakeTaskRepository,
  FakeWorkflowDefinitionRepository,
  FakeWorkflowNodeTaskRepository,
  FakeWorkflowRunEventLog,
  FakeWorkflowRunRepository,
} from './fakes'

export const createTestApp = () => {
  const accountsRepository = new FakeAccountsRepository([createDefaultUser()])
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
  const workflowsService = new WorkflowsService(
    {
      definitions: new FakeWorkflowDefinitionRepository(),
      nodeStates: runs,
      nodeTasks: new FakeWorkflowNodeTaskRepository(runs),
      runs,
    },
    tasksService,
    new TaskConfigAssembler(modelRegistry),
    new WorkflowMediaResolver(mediaObjectService, tasksService),
    new FakeWorkflowRunEventLog(),
  )

  return createApp({
    accountsService: new AccountsService(accountsRepository),
    storage: new FakeObjectStorage(),
    tasksService,
    workflowsService,
  })
}
