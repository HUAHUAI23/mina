import { describe, expect, test } from 'bun:test'

import type { TasksService } from '../modules/tasks/tasks.service'
import type { WorkflowsService } from '../modules/workflows/workflows.service'
import { BackgroundTaskScheduler } from './background-scheduler'

class SchedulerProbe {
  activeTicks = 0
  maxConcurrentTicks = 0
  taskStarts = 0
  taskPolls = 0
  workflowReconciliations = 0
  releaseTick: (() => void) | undefined

  readonly tasksService = {
    startQueuedTasks: async () => {
      this.taskStarts += 1
      return []
    },
    pollAsyncTasks: async () => {
      this.taskPolls += 1
      this.activeTicks += 1
      this.maxConcurrentTicks = Math.max(this.maxConcurrentTicks, this.activeTicks)
      await new Promise<void>((resolve) => {
        this.releaseTick = resolve
      })
      this.activeTicks -= 1
      return []
    },
  } as unknown as TasksService

  readonly workflowsService = {
    reconcileRunningRuns: async () => {
      this.workflowReconciliations += 1
      return []
    },
  } as unknown as WorkflowsService
}

describe('BackgroundTaskScheduler', () => {
  test('does not overlap ticks while a previous tick is still running', async () => {
    const probe = new SchedulerProbe()
    const scheduler = new BackgroundTaskScheduler({
      cronPattern: '*/5 * * * * *',
      tasksService: probe.tasksService,
      workflowsService: probe.workflowsService,
    })

    const firstTick = scheduler.tick()
    await scheduler.tick()
    expect(probe.taskStarts).toBe(1)
    expect(probe.taskPolls).toBe(1)
    expect(probe.workflowReconciliations).toBe(0)
    expect(probe.maxConcurrentTicks).toBe(1)

    probe.releaseTick?.()
    await firstTick

    expect(probe.workflowReconciliations).toBe(1)
  })
})
