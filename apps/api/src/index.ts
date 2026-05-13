import { BackgroundTaskScheduler } from './app/background-scheduler'
import { createApp } from './app/create-app'
import { createAppDependencies } from './app/dependencies'
import { apiEnv } from './config/env'
import { appLogger } from './lib/logger/logger'

const dependencies = createAppDependencies()
const app = createApp(dependencies)
const scheduler = new BackgroundTaskScheduler({
  cronPattern: apiEnv.schedulerCron,
  logger: appLogger,
  tasksService: dependencies.tasksService,
  workflowsService: dependencies.workflowsService,
})

if (apiEnv.nodeEnv !== 'test') {
  appLogger.info({ port: apiEnv.port }, 'API server started.')
}

if (apiEnv.schedulerEnabled && apiEnv.nodeEnv !== 'test') {
  scheduler.start()
}

export { app, scheduler }
export type { AppType } from './client'

export default {
  port: apiEnv.port,
  fetch: app.fetch,
}
