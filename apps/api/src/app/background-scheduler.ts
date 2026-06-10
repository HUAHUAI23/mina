import { Cron } from 'croner'

import { appLogger, type AppLogger } from '../lib/logger/logger'
import type { ChatService } from '../modules/chat/chat.service'
import type { TasksService } from '../modules/tasks/tasks.service'
import type { WorkflowsService } from '../modules/workflows/workflows.service'

interface BackgroundSchedulerInput {
  chatService: Pick<ChatService, 'reconcileAssistantRuns'>
  cronPattern: string
  logger?: AppLogger
  tasksService: TasksService
  workflowsService: WorkflowsService
}

export class BackgroundTaskScheduler {
  #isRunning = false
  #job: Cron | undefined
  readonly #logger: AppLogger

  constructor(private readonly input: BackgroundSchedulerInput) {
    this.#logger = input.logger ?? appLogger
  }

  start(): void {
    if (this.#job) {
      return
    }

    void this.tick()
    this.#job = new Cron(
      this.input.cronPattern,
      {
        catch: (error) => {
          this.#logger.error({ error }, 'Background task scheduler cron failed.')
        },
        name: 'mina-background-task-scheduler',
        protect: true,
      },
      () => this.tick(),
    )
  }

  stop(): void {
    if (!this.#job) {
      return
    }

    this.#job.stop()
    this.#job = undefined
  }

  async tick(): Promise<void> {
    if (this.#isRunning) {
      return
    }

    this.#isRunning = true
    try {
      await this.input.workflowsService.publishTaskStatusUpdates(
        await this.input.tasksService.startQueuedTasks(),
      )
      await this.input.workflowsService.publishTaskStatusUpdates(
        await this.input.tasksService.pollAsyncTasks(),
      )
      await this.input.workflowsService.reconcileRunningRuns()
      await this.input.chatService.reconcileAssistantRuns()
    } catch (error) {
      this.#logger.error({ error }, 'Background task scheduler tick failed.')
    } finally {
      this.#isRunning = false
    }
  }
}
