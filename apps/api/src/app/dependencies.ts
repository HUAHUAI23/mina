import { createDbClient } from '../db/client'
import { apiEnv } from '../config/env'
import { createObjectStorage } from '../lib/storage/create-object-storage'
import type { ObjectStorage } from '../lib/storage/object-storage'
import { AccountManagementService } from '../modules/accounts/account-management.service'
import { DrizzleAccountsRepository } from '../modules/accounts/accounts.drizzle-repository'
import { AccountsService } from '../modules/accounts/accounts.service'
import { DrizzleAssetLibraryRepository } from '../modules/assets/asset-library.drizzle-repository'
import { AssetLibraryService } from '../modules/assets/asset-library.service'
import { DrizzleMediaObjectRepository } from '../modules/media/media-object.drizzle-repository'
import { MediaObjectService } from '../modules/media/media-object.service'
import { FetchRemoteMediaFetcher } from '../modules/media/remote-media-fetcher'
import { DrizzlePricingRepository } from '../modules/pricing/pricing.drizzle-repository'
import { PricingService } from '../modules/pricing/pricing.service'
import { DrizzleProjectRepository } from '../modules/projects/projects.drizzle-repository'
import { ProjectsService } from '../modules/projects/projects.service'
import { TaskConfigAssembler } from '../modules/tasks/config/task-config-assembler'
import { ModelRegistry } from '../modules/tasks/models/model-registry'
import { TaskModelCatalogService } from '../modules/tasks/models/model-catalog.service'
import { ProviderRouter } from '../modules/tasks/models/provider-router'
import { registerTaskModels } from '../modules/tasks/models/register-models'
import { OutputPostProcessor } from '../modules/tasks/output/output-post-processor'
import { TaskOutputFinalizer } from '../modules/tasks/output/task-output-finalizer'
import { FfmpegVideoFrameGenerator } from '../modules/tasks/output/video-frame-generator'
import { MediaResolvingTaskProvider } from '../modules/tasks/providers/media-resolving-task-provider'
import { ProviderMediaUrlResolver } from '../modules/tasks/providers/provider-media-url-resolver'
import { DrizzleTaskEventLog } from '../modules/tasks/task-events'
import { DrizzleTaskRepository } from '../modules/tasks/tasks.drizzle-repository'
import { TasksService } from '../modules/tasks/tasks.service'
import { DrizzleWorkflowRunEventLog } from '../modules/workflows/workflow-events'
import { InMemoryWorkflowEventBus } from '../modules/workflows/workflow-event-bus'
import { BusWorkflowRunEventPublisher } from '../modules/workflows/workflow-run-event-publisher'
import { WorkflowMediaResolver } from '../modules/workflows/media/workflow-media-resolver'
import { DrizzleWorkflowYjsRepository } from '../modules/workflows/collaboration/drizzle-workflow-yjs.repository'
import {
  DrizzleWorkflowDefinitionRepository,
  DrizzleWorkflowNodeTaskRepository,
  DrizzleWorkflowRunNodeStateRepository,
  DrizzleWorkflowRunRepository,
} from '../modules/workflows/workflows.drizzle-repository'
import { WorkflowsService } from '../modules/workflows/workflows.service'
import { WorkflowYjsRoomService } from '../modules/workflows/collaboration/workflow-yjs-room.service'

export interface AppDependencies {
  accountManagementService: AccountManagementService
  accountsService: AccountsService
  assetLibraryService: AssetLibraryService
  mediaObjectService: MediaObjectService
  modelCatalogService: TaskModelCatalogService
  projectsService: ProjectsService
  storage: ObjectStorage
  tasksService: TasksService
  workflowEventBus: InMemoryWorkflowEventBus
  workflowYjsRoomService: WorkflowYjsRoomService
  workflowsService: WorkflowsService
}

export const createAppDependencies = (): AppDependencies => {
  const db = createDbClient()
  const accountsRepository = new DrizzleAccountsRepository(db)
  const runs = new DrizzleWorkflowRunRepository(db)
  const repositories = {
    pricingRepository: new DrizzlePricingRepository(db),
    mediaObjectRepository: new DrizzleMediaObjectRepository(db),
    assetLibraryRepository: new DrizzleAssetLibraryRepository(db),
    projectRepository: new DrizzleProjectRepository(db),
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
  const providerMediaUrlResolver = new ProviderMediaUrlResolver(
    mediaObjectService,
    apiEnv.providerMediaUrlExpiresSeconds,
  )
  const taskProvider = new MediaResolvingTaskProvider(
    new ProviderRouter(modelRegistry),
    providerMediaUrlResolver,
  )
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
  const workflowRunEventPublisher = new BusWorkflowRunEventPublisher(workflowEventBus)
  const workflowYjsRoomService = new WorkflowYjsRoomService(
    new DrizzleWorkflowYjsRepository(db),
    undefined,
    {
      onSnapshotSaved: async ({ timestamp, version, workflowId }) => {
        await repositories.workflowRepositories.definitions.touch(workflowId, timestamp, version)
      },
    },
  )
  const workflowsService = new WorkflowsService(
    repositories.workflowRepositories,
    tasksService,
    taskConfigAssembler,
    workflowMediaResolver,
    workflowYjsRoomService,
    repositories.workflowRunEventLog,
    workflowRunEventPublisher,
    workflowEventBus,
  )
  const projectsService = new ProjectsService(
    repositories.projectRepository,
    repositories.workflowRepositories.definitions,
  )
  const assetLibraryService = new AssetLibraryService(
    repositories.assetLibraryRepository,
    mediaObjectService,
    repositories.projectRepository,
  )
  const accountsService = new AccountsService(accountsRepository, {
    onAccountCreated: (accountId) => assetLibraryService.seedAccount(accountId),
  })

  return {
    accountManagementService: new AccountManagementService(accountsRepository, storage, mediaObjectService),
    accountsService,
    assetLibraryService,
    mediaObjectService,
    modelCatalogService,
    projectsService,
    storage,
    tasksService,
    workflowEventBus,
    workflowYjsRoomService,
    workflowsService,
  }
}
