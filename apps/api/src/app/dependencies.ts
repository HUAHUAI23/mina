import { apiEnv } from '../config/env'
import { createDbClient } from '../db/client'
import { createObjectStorage } from '../lib/storage/create-object-storage'
import type { ObjectStorage } from '../lib/storage/object-storage'
import { DrizzleMediaObjectRepository } from '../modules/media/media-object.drizzle-repository'
import { InMemoryMediaObjectRepository } from '../modules/media/media-object.repository'
import { MediaObjectService } from '../modules/media/media-object.service'
import { FetchRemoteMediaFetcher } from '../modules/media/remote-media-fetcher'
import { createSeedPosts } from '../modules/posts/posts.data'
import { InMemoryPostRepository } from '../modules/posts/posts.repository'
import { PostsService } from '../modules/posts/posts.service'
import { DrizzlePricingRepository } from '../modules/pricing/pricing.drizzle-repository'
import { InMemoryPricingRepository } from '../modules/pricing/pricing.repository'
import { PricingService } from '../modules/pricing/pricing.service'
import { TaskConfigAssembler } from '../modules/tasks/config/task-config-assembler'
import { ModelRegistry } from '../modules/tasks/models/model-registry'
import { ProviderRouter } from '../modules/tasks/models/provider-router'
import { registerTaskModels } from '../modules/tasks/models/register-models'
import { OutputPostProcessor } from '../modules/tasks/output/output-post-processor'
import { TaskOutputFinalizer } from '../modules/tasks/output/task-output-finalizer'
import { FfmpegVideoFrameGenerator } from '../modules/tasks/output/video-frame-generator'
import { DrizzleTaskEventLog, InMemoryTaskEventLog } from '../modules/tasks/task-events'
import { DrizzleTaskRepository } from '../modules/tasks/tasks.drizzle-repository'
import { InMemoryTaskRepository } from '../modules/tasks/tasks.repository'
import { TasksService } from '../modules/tasks/tasks.service'
import { DrizzleWorkflowRunEventLog, InMemoryWorkflowRunEventLog } from '../modules/workflows/workflow-events'
import { WorkflowMediaResolver } from '../modules/workflows/media/workflow-media-resolver'
import {
  DrizzleWorkflowDefinitionRepository,
  DrizzleWorkflowNodeTaskRepository,
  DrizzleWorkflowRunNodeStateRepository,
  DrizzleWorkflowRunRepository,
} from '../modules/workflows/workflows.drizzle-repository'
import {
  InMemoryWorkflowDefinitionRepository,
  InMemoryWorkflowNodeTaskRepository,
  InMemoryWorkflowRunRepository,
} from '../modules/workflows/workflows.repository'
import { WorkflowsService } from '../modules/workflows/workflows.service'

export interface AppDependencies {
  postsService: PostsService
  storage: ObjectStorage
  tasksService: TasksService
  workflowsService: WorkflowsService
}

export const createAppDependencies = (): AppDependencies => {
  const postRepository = new InMemoryPostRepository(createSeedPosts())
  const repositories =
    apiEnv.persistenceDriver === 'postgres'
      ? (() => {
          const db = createDbClient()
          return {
            pricingRepository: new DrizzlePricingRepository(db),
            mediaObjectRepository: new DrizzleMediaObjectRepository(db),
            taskEventLog: new DrizzleTaskEventLog(db),
            taskRepository: new DrizzleTaskRepository(db),
            workflowRunEventLog: new DrizzleWorkflowRunEventLog(db),
            workflowRepositories: (() => {
              const runs = new DrizzleWorkflowRunRepository(db)
              return {
                definitions: new DrizzleWorkflowDefinitionRepository(db),
                nodeStates: new DrizzleWorkflowRunNodeStateRepository(db),
                nodeTasks: new DrizzleWorkflowNodeTaskRepository(db),
                runs,
              }
            })(),
          }
        })()
      : (() => {
          const runs = new InMemoryWorkflowRunRepository()
          return {
            pricingRepository: new InMemoryPricingRepository(),
            mediaObjectRepository: new InMemoryMediaObjectRepository(),
            taskEventLog: new InMemoryTaskEventLog(),
            taskRepository: new InMemoryTaskRepository(),
            workflowRunEventLog: new InMemoryWorkflowRunEventLog(),
            workflowRepositories: {
              definitions: new InMemoryWorkflowDefinitionRepository(),
              nodeStates: runs,
              nodeTasks: new InMemoryWorkflowNodeTaskRepository(runs),
              runs,
            },
          }
        })()

  const pricingService = new PricingService(repositories.pricingRepository)
  const storage = createObjectStorage()
  const mediaObjectService = new MediaObjectService(
    repositories.mediaObjectRepository,
    storage,
    new FetchRemoteMediaFetcher(),
  )
  const modelRegistry = registerTaskModels(new ModelRegistry())
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
  const workflowsService = new WorkflowsService(
    repositories.workflowRepositories,
    tasksService,
    taskConfigAssembler,
    workflowMediaResolver,
    repositories.workflowRunEventLog,
  )

  return {
    postsService: new PostsService(postRepository),
    storage,
    tasksService,
    workflowsService,
  }
}
