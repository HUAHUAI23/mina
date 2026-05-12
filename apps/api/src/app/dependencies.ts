import { createSeedPosts } from '../modules/posts/posts.data'
import { InMemoryPostRepository } from '../modules/posts/posts.repository'
import { PostsService } from '../modules/posts/posts.service'
import { InMemoryPricingRepository } from '../modules/pricing/pricing.repository'
import { PricingService } from '../modules/pricing/pricing.service'
import { DevTaskProvider } from '../modules/tasks/tasks.provider'
import { InMemoryTaskRepository } from '../modules/tasks/tasks.repository'
import { TasksService } from '../modules/tasks/tasks.service'
import { InMemoryWorkflowRepository } from '../modules/workflows/workflows.repository'
import { WorkflowsService } from '../modules/workflows/workflows.service'

export interface AppDependencies {
  postsService: PostsService
  tasksService: TasksService
  workflowsService: WorkflowsService
}

export const createAppDependencies = (): AppDependencies => {
  const postRepository = new InMemoryPostRepository(createSeedPosts())
  const pricingService = new PricingService(new InMemoryPricingRepository())
  const tasksService = new TasksService(new InMemoryTaskRepository(), pricingService, new DevTaskProvider())
  const workflowsService = new WorkflowsService(new InMemoryWorkflowRepository(), tasksService)

  return {
    postsService: new PostsService(postRepository),
    tasksService,
    workflowsService,
  }
}
