import { describe, expect, test } from 'bun:test'

import { InMemoryPricingRepository } from '../pricing/pricing.repository'
import { PricingService } from '../pricing/pricing.service'
import { InMemoryTaskEventLog } from './task-events'
import { DevTaskProvider, type TaskProvider } from './tasks.provider'
import { InMemoryTaskRepository } from './tasks.repository'
import { TasksService } from './tasks.service'

const videoOutput = (taskId: string) => ({
  resources: [
    {
      id: `${taskId}:video:0`,
      kind: 'video' as const,
      role: 'generated_video' as const,
      index: 0,
      url: `mina://tasks/${taskId}/outputs/0.mp4`,
    },
  ],
  variables: {
    videoUrls: [`mina://tasks/${taskId}/outputs/0.mp4`],
  },
})

const createService = (taskProvider: TaskProvider = new DevTaskProvider()) => {
  const taskEventLog = new InMemoryTaskEventLog()
  const taskRepository = new InMemoryTaskRepository()
  const tasksService = new TasksService(
    taskRepository,
    new PricingService(new InMemoryPricingRepository()),
    taskProvider,
    taskEventLog,
  )

  return { taskEventLog, tasksService }
}

describe('TasksService event logging', () => {
  test('prices image generation by image count', async () => {
    const { tasksService } = createService()
    const task = await tasksService.createTask({
      accountId: 'account',
      config: {
        kind: 'image_generation',
        mode: 'text_to_image',
        provider: 'dev',
        model: 'dev-image',
        prompt: 'image',
        size: '1024x1024',
        count: 3,
      },
    })

    expect(task.cost.usage).toEqual({
      amount: 3,
      metric: 'image',
    })
    expect(task.cost.estimatedCost).toBe(3)
  })

  test('records task lifecycle events', async () => {
    const { taskEventLog, tasksService } = createService()
    const task = await tasksService.createTask({
      accountId: 'account',
      config: {
        kind: 'image_generation',
        mode: 'text_to_image',
        provider: 'dev',
        model: 'dev-image',
        prompt: 'image',
        size: '1024x1024',
        count: 1,
      },
    })

    const completed = await tasksService.runTask(task.id)
    expect(completed.status).toBe('succeeded')

    const events = await taskEventLog.listEvents(task.id)
    expect(events.map((event) => event.eventType)).toEqual(['task.created', 'task.started', 'task.succeeded'])
    expect(events[0]?.payload).toMatchObject({
      estimatedCost: 1,
      status: 'queued',
    })
    expect(events[2]?.payload).toMatchObject({
      outputResourceCount: 1,
      status: 'succeeded',
    })
  })

  test('returns the existing task for a repeated idempotency key', async () => {
    const { taskEventLog, tasksService } = createService()
    const input = {
      accountId: 'account',
      idempotencyKey: 'client-request-1',
      config: {
        kind: 'image_generation' as const,
        mode: 'text_to_image' as const,
        provider: 'dev',
        model: 'dev-image',
        prompt: 'image',
        size: '1024x1024',
        count: 1,
      },
    }

    const first = await tasksService.createTask(input)
    const second = await tasksService.createTask(input)

    expect(second.id).toBe(first.id)
    expect(second.idempotencyKey).toBe('client-request-1')
    expect(await taskEventLog.listEvents(first.id)).toHaveLength(1)
  })

  test('starts queued tasks from the background worker path', async () => {
    const { taskEventLog, tasksService } = createService()
    const task = await tasksService.createTask({
      accountId: 'account',
      config: {
        kind: 'image_generation',
        mode: 'text_to_image',
        provider: 'dev',
        model: 'dev-image',
        prompt: 'image',
        size: '1024x1024',
        count: 1,
      },
    })

    const [completed] = await tasksService.startQueuedTasks()

    expect(completed?.id).toBe(task.id)
    expect(completed?.status).toBe('succeeded')
    expect(completed?.output?.resources[0]?.role).toBe('generated_image')
    expect((await taskEventLog.listEvents(task.id)).map((event) => event.eventType)).toEqual([
      'task.created',
      'task.started',
      'task.succeeded',
    ])
  })

  test('retries provider start transport errors without failing the task immediately', async () => {
    const failingProvider: TaskProvider = {
      poll: async () => ({
        code: 'PROVIDER_FAILED',
        message: 'Provider failed.',
        status: 'failed',
      }),
      start: async () => {
        throw new Error('Provider failed.')
      },
    }
    const { taskEventLog, tasksService } = createService(failingProvider)
    const task = await tasksService.createTask({
      accountId: 'account',
      config: {
        kind: 'image_generation',
        mode: 'text_to_image',
        provider: 'dev',
        model: 'dev-image',
        prompt: 'image',
        size: '1024x1024',
        count: 1,
      },
    })

    const retried = await tasksService.startQueuedTasks()
    const failed = retried[0]

    expect(failed?.status).toBe('queued')
    expect(failed?.error).toMatchObject({
      code: 'TASK_START_RETRY',
      message: 'Provider failed.',
    })
    const events = await taskEventLog.listEvents(task.id)
    expect(events.map((event) => event.eventType)).toEqual(['task.created', 'task.started', 'task.start.retry'])
    expect(events[2]?.payload).toMatchObject({
      retryCount: 1,
      status: 'queued',
    })
  })

  test('keeps async tasks running while provider polling is pending', async () => {
    let pollCount = 0
    const asyncProvider: TaskProvider = {
      poll: async (task) => {
        pollCount += 1
        if (pollCount === 1) {
          return {
            nextPollAfterSeconds: 0,
            progress: 0.5,
            providerStatus: 'processing',
            status: 'pending',
          }
        }

        return {
          output: videoOutput(task.id),
          providerStatus: 'completed',
          status: 'succeeded',
        }
      },
      start: async (task) => ({
        externalTaskId: `external_${task.id}`,
        providerStatus: 'submitted',
        status: 'submitted',
      }),
    }
    const { taskEventLog, tasksService } = createService(asyncProvider)
    const task = await tasksService.createTask({
      accountId: 'account',
      config: {
        kind: 'video_generation',
        provider: 'dev',
        model: 'dev-video',
        prompt: 'video',
        resolution: '720p',
        durationSeconds: 2,
        referenceImages: [],
        referenceAudios: [],
        referenceVideos: [],
        outputLastFrame: false,
      },
    })

    const [submitted] = await tasksService.startQueuedTasks()
    expect(submitted?.status).toBe('running')
    expect(submitted?.mode).toBe('async')
    expect(submitted?.externalTaskId).toBe(`external_${task.id}`)

    const [pending] = await tasksService.pollAsyncTasks()
    expect(pending?.status).toBe('running')
    expect(pending?.providerStatus).toBe('processing')
    expect(pending?.retryCount).toBe(0)

    const [completed] = await tasksService.pollAsyncTasks()
    expect(completed?.status).toBe('succeeded')
    expect(completed?.output?.resources[0]?.role).toBe('generated_video')

    const events = await taskEventLog.listEvents(task.id)
    expect(events.map((event) => event.eventType)).toEqual([
      'task.created',
      'task.started',
      'task.submitted',
      'task.polling',
      'task.poll.pending',
      'task.polling',
      'task.succeeded',
    ])
  })

  test('retries transport-level provider polling errors without failing the task immediately', async () => {
    const flakyProvider: TaskProvider = {
      poll: async () => {
        throw new Error('Provider API unavailable.')
      },
      start: async (task) => ({
        externalTaskId: `external_${task.id}`,
        status: 'submitted',
      }),
    }
    const { taskEventLog, tasksService } = createService(flakyProvider)
    const task = await tasksService.createTask({
      accountId: 'account',
      config: {
        kind: 'video_generation',
        provider: 'dev',
        model: 'dev-video',
        prompt: 'video',
        resolution: '720p',
        durationSeconds: 2,
        referenceImages: [],
        referenceAudios: [],
        referenceVideos: [],
        outputLastFrame: false,
      },
    })

    await tasksService.startQueuedTasks()
    const [retried] = await tasksService.pollAsyncTasks()

    expect(retried?.status).toBe('running')
    expect(retried?.retryCount).toBe(1)
    expect(retried?.error).toMatchObject({
      code: 'TASK_POLL_RETRY',
      message: 'Provider API unavailable.',
    })

    const events = await taskEventLog.listEvents(task.id)
    expect(events.map((event) => event.eventType)).toContain('task.poll.retry')
  })
})
