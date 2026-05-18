import { createDbClient } from '../db/client'
import { createObjectStorage } from '../lib/storage/create-object-storage'
import type { ObjectStorage } from '../lib/storage/object-storage'
import { DrizzleAccountsRepository } from '../modules/accounts/accounts.drizzle-repository'
import { AccountsService } from '../modules/accounts/accounts.service'
import { DrizzleMediaObjectRepository } from '../modules/media/media-object.drizzle-repository'
import { MediaObjectService } from '../modules/media/media-object.service'
import { FetchRemoteMediaFetcher } from '../modules/media/remote-media-fetcher'
import { DrizzlePricingRepository } from '../modules/pricing/pricing.drizzle-repository'
import { PricingService } from '../modules/pricing/pricing.service'
import { TaskConfigAssembler } from '../modules/tasks/config/task-config-assembler'
import { ModelRegistry } from '../modules/tasks/models/model-registry'
import { TaskModelCatalogService } from '../modules/tasks/models/model-catalog.service'
import { ProviderRouter } from '../modules/tasks/models/provider-router'
import { registerTaskModels } from '../modules/tasks/models/register-models'
import { OutputPostProcessor } from '../modules/tasks/output/output-post-processor'
import { TaskOutputFinalizer } from '../modules/tasks/output/task-output-finalizer'
import { FfmpegVideoFrameGenerator } from '../modules/tasks/output/video-frame-generator'
import { DrizzleTaskEventLog } from '../modules/tasks/task-events'
import { DrizzleTaskRepository } from '../modules/tasks/tasks.drizzle-repository'
import { TasksService } from '../modules/tasks/tasks.service'
import { DrizzleWorkflowRunEventLog } from '../modules/workflows/workflow-events'
import { InMemoryWorkflowEventBus } from '../modules/workflows/workflow-event-bus'
import { WorkflowMediaResolver } from '../modules/workflows/media/workflow-media-resolver'
import {
  DrizzleWorkflowDefinitionRepository,
  DrizzleWorkflowNodeTaskRepository,
  DrizzleWorkflowRunNodeStateRepository,
  DrizzleWorkflowRunRepository,
} from '../modules/workflows/workflows.drizzle-repository'
import { WorkflowsService } from '../modules/workflows/workflows.service'

export interface AppDependencies {
  accountsService: AccountsService
  mediaObjectService: MediaObjectService
  modelCatalogService: TaskModelCatalogService
  storage: ObjectStorage
  tasksService: TasksService
  workflowEventBus: InMemoryWorkflowEventBus
  workflowsService: WorkflowsService
}

export const createAppDependencies = (): AppDependencies => {
  const db = createDbClient()
  const accountsRepository = new DrizzleAccountsRepository(db)
  const runs = new DrizzleWorkflowRunRepository(db)
  const repositories = {
    pricingRepository: new DrizzlePricingRepository(db),
    mediaObjectRepository: new DrizzleMediaObjectRepository(db),
    taskEventLog: new DrizzleTaskEventLog(db),
    taskRepository: new DrizzleTaskRepository(db),
    workflowRunEventLog: new DrizzleWorkflowRunEventLog(db),
    workflowRepositories: {
      definitions: new DrizzleWorkflowDefinitionRepository(db),
      nodeStates: new DrizzleWorkflowRunNodeStateRepository(db),
      nodeTasks: new DrizzleWorkflowNodeTaskRepository(db),
      runs,
    },
  }

  const pricingService = new PricingService(repositories.pricingRepository)
  const storage = createObjectStorage()
  const mediaObjectService = new MediaObjectService(
    repositories.mediaObjectRepository,
    storage,
    new FetchRemoteMediaFetcher(),
  )
  const modelRegistry = registerTaskModels(new ModelRegistry())
  const modelCatalogService = new TaskModelCatalogService(modelRegistry)
  const taskConfigAssembler = new TaskConfigAssembler(modelRegistry)
  const taskProvider = new ProviderRouter(modelRegistry)
  const outputFinalizer = new TaskOutputFinalizer(mediaObjectService)
  const outputPostProcessor = new OutputPostProcessor(new FfmpegVideoFrameGenerator(mediaObjectService))
  const tasksService = new TasksService(
    repositories.taskRepository,
    pricingService,
    taskProvider,
    modelRegistry,
    outputFinalizer,
    outputPostProcessor,
    repositories.taskEventLog,
  )
  const workflowMediaResolver = new WorkflowMediaResolver(mediaObjectService, tasksService)
  const workflowEventBus = new InMemoryWorkflowEventBus()
  const workflowsService = new WorkflowsService(
    repositories.workflowRepositories,
    tasksService,
    taskConfigAssembler,
    workflowMediaResolver,
    repositories.workflowRunEventLog,
    workflowEventBus,
  )

  return {
    accountsService: new AccountsService(accountsRepository),
    mediaObjectService,
    modelCatalogService,
    storage,
    tasksService,
    workflowEventBus,
    workflowsService,
  }
}
