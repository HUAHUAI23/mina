import { apiEnv } from '../config/env'
import { createDbClient } from '../db/client'
import { createObjectStorage } from '../lib/storage/create-object-storage'
import type { ObjectStorage } from '../lib/storage/object-storage'
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
import { FfmpegVideoCoverGenerator } from '../modules/tasks/output/video-cover-generator'
import { DrizzleTaskEventLog, InMemoryTaskEventLog } from '../modules/tasks/task-events'
import { DrizzleTaskRepository } from '../modules/tasks/tasks.drizzle-repository'
import { InMemoryTaskRepository } from '../modules/tasks/tasks.repository'
import { TasksService } from '../modules/tasks/tasks.service'
import { DrizzleWorkflowRunEventLog, InMemoryWorkflowRunEventLog } from '../modules/workflows/workflow-events'
import { DrizzleWorkflowRepository } from '../modules/workflows/workflows.drizzle-repository'
import { InMemoryWorkflowRepository } from '../modules/workflows/workflows.repository'
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
            taskEventLog: new DrizzleTaskEventLog(db),
            taskRepository: new DrizzleTaskRepository(db),
            workflowRunEventLog: new DrizzleWorkflowRunEventLog(db),
            workflowRepository: new DrizzleWorkflowRepository(db),
          }
        })()
      : {
          pricingRepository: new InMemoryPricingRepository(),
          taskEventLog: new InMemoryTaskEventLog(),
          taskRepository: new InMemoryTaskRepository(),
          workflowRunEventLog: new InMemoryWorkflowRunEventLog(),
          workflowRepository: new InMemoryWorkflowRepository(),
        }

  const pricingService = new PricingService(repositories.pricingRepository)
  const storage = createObjectStorage()
  const modelRegistry = registerTaskModels(new ModelRegistry())
  const taskConfigAssembler = new TaskConfigAssembler(modelRegistry)
  const taskProvider = new ProviderRouter(modelRegistry)
  const outputPostProcessor = new OutputPostProcessor(new FfmpegVideoCoverGenerator(storage))
  const tasksService = new TasksService(
    repositories.taskRepository,
    pricingService,
    taskProvider,
    modelRegistry,
    outputPostProcessor,
    repositories.taskEventLog,
  )
  const workflowsService = new WorkflowsService(
    repositories.workflowRepository,
    tasksService,
    taskConfigAssembler,
    repositories.workflowRunEventLog,
  )

  return {
    postsService: new PostsService(postRepository),
    storage,
    tasksService,
    workflowsService,
  }
}
