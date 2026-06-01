import { describe, expect, test } from 'bun:test'
import type { TaskConfig } from '@mina/contracts/modules/tasks'
import { z } from 'zod'

import {
  FakeMediaObjectRepository,
  FakeObjectStorage,
  FakePricingRepository,
  FakeTaskEventLog,
  FakeTaskRepository,
} from '../../test/fakes'
import { MediaObjectService } from '../media/media-object.service'
import { PricingService } from '../pricing/pricing.service'
import { ModelRegistry } from './models/model-registry'
import { ProviderRouter } from './models/provider-router'
import { registerTaskModels } from './models/register-models'
import { OutputPostProcessor } from './output/output-post-processor'
import { TaskOutputFinalizer } from './output/task-output-finalizer'
import { DeterministicVideoFrameGenerator } from './output/video-frame-generator'
import { MediaResolvingTaskProvider } from './providers/media-resolving-task-provider'
import { ProviderMediaUrlResolver } from './providers/provider-media-url-resolver'
import type { TaskProvider } from './providers/provider'
import { TasksService } from './tasks.service'

const imageConfig = (count = 1): TaskConfig => ({
  kind: 'image_generation',
  provider: 'dev',
  model: 'dev-image',
  prompt: 'image',
  media: {
    inputImages: [],
    referenceImages: [],
    referenceAudios: [],
    referenceVideos: [],
  },
  params: {
    count,
    size: '1024x1024',
  },
})

const videoConfig = (params: Record<string, unknown> = {}): TaskConfig => ({
  kind: 'video_generation',
  provider: 'dev',
  model: 'dev-video',
  prompt: 'video',
  media: {
    inputImages: [],
    referenceImages: [],
    referenceAudios: [],
    referenceVideos: [],
  },
  params: {
    durationSeconds: 2,
    outputLastFrame: false,
    resolution: '720p',
    ...params,
  },
})

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

const createService = (taskProvider?: TaskProvider) => {
  const taskEventLog = new FakeTaskEventLog()
  const taskRepository = new FakeTaskRepository()
  const modelRegistry = registerTaskModels(new ModelRegistry())
  const mediaObjectService = new MediaObjectService(
    new FakeMediaObjectRepository(),
    new FakeObjectStorage(),
    {
      fetch: async () => {
        throw new Error('fetcher not configured')
      },
    },
  )
  const tasksService = new TasksService(
    taskRepository,
    new PricingService(new FakePricingRepository()),
    taskProvider ?? new ProviderRouter(modelRegistry),
    modelRegistry,
    new TaskOutputFinalizer(mediaObjectService),
    new OutputPostProcessor(
      new DeterministicVideoFrameGenerator(mediaObjectService),
    ),
    taskEventLog,
  )

  return { mediaObjectService, taskEventLog, taskRepository, tasksService }
}

describe('TasksService event logging', () => {
  test('prices image generation by image count', async () => {
    const { tasksService } = createService()
    const task = await tasksService.createTask({
      accountId: 'account',
      config: imageConfig(3),
    })

    expect(task.cost.usage).toEqual({
      amount: 3,
      metric: 'image',
    })
    expect(task.cost.estimatedCost).toBe(3)
  })

  test('scales actual image cost to the number of successful partial outputs', async () => {
    const { taskEventLog, tasksService } = createService({
      cancel: async () => {},
      poll: async () => ({ status: 'pending' }),
      start: async (task) => ({
        actualUsage: { amount: 2, metric: 'image' },
        metadata: {
          failedImageCount: 1,
          partialFailures: [{ attempt: 1, message: 'provider timeout' }],
          requestedImageCount: 3,
          succeededImageCount: 2,
        },
        output: {
          resources: [
            {
              id: `${task.id}:image:0`,
              index: 0,
              kind: 'image',
              role: 'generated_image',
              url: `mina://tasks/${task.id}/outputs/0.png`,
            },
            {
              id: `${task.id}:image:1`,
              index: 1,
              kind: 'image',
              role: 'generated_image',
              url: `mina://tasks/${task.id}/outputs/1.png`,
            },
          ],
          variables: {},
        },
        status: 'succeeded',
      }),
    })
    const task = await tasksService.createTask({
      accountId: 'account',
      config: imageConfig(3),
    })

    const completed = await tasksService.runTask(task.id)

    expect(completed.status).toBe('succeeded')
    expect(completed.cost.actualCost).toBe(2)
    expect(completed.cost.usage).toEqual({ amount: 3, metric: 'image' })
    expect(completed.output?.resources).toHaveLength(2)
    expect(completed.providerMetadata).toMatchObject({
      failedImageCount: 1,
      requestedImageCount: 3,
      succeededImageCount: 2,
    })
    const events = await taskEventLog.listEvents(task.id)
    expect(events.at(-1)?.payload).toMatchObject({
      actualUsageAmount: 2,
      outputResourceCount: 2,
      providerMetadata: {
        failedImageCount: 1,
        requestedImageCount: 3,
        succeededImageCount: 2,
      },
    })
  })

  test('records task lifecycle events', async () => {
    const { taskEventLog, tasksService } = createService()
    const task = await tasksService.createTask({
      accountId: 'account',
      config: imageConfig(),
    })

    const completed = await tasksService.runTask(task.id)
    expect(completed.status).toBe('succeeded')

    const events = await taskEventLog.listEvents(task.id)
    expect(events.map((event) => event.eventType)).toEqual([
      'task.created',
      'task.started',
      'task.succeeded',
    ])
    expect(events[0]?.payload).toMatchObject({
      estimatedCost: 1,
      status: 'queued',
    })
    expect(events[2]?.payload).toMatchObject({
      outputResourceCount: 1,
      status: 'succeeded',
    })
  })

  test('creates a new task for each create request', async () => {
    const { tasksService } = createService()
    const input = {
      accountId: 'account',
      config: imageConfig(),
    }

    const first = await tasksService.createTask(input)
    const second = await tasksService.createTask(input)

    expect(second.id).not.toBe(first.id)
  })

  test('returns the existing task for duplicate idempotency keys', async () => {
    const { taskEventLog, taskRepository, tasksService } = createService()
    const input = {
      accountId: 'account',
      config: imageConfig(),
      idempotencyKey: 'workflow_run:run_a:node:image',
    }

    const first = await tasksService.createTask(input)
    const second = await tasksService.createTask(input)

    expect(second.id).toBe(first.id)
    expect(second.idempotencyKey).toBe(input.idempotencyKey)
    expect(await taskRepository.list()).toHaveLength(1)
    expect(await taskEventLog.listEvents(first.id)).toHaveLength(1)
  })

  test('starts queued tasks from the background worker path', async () => {
    const { taskEventLog, taskRepository, tasksService } = createService()
    const task = await tasksService.createTask({
      accountId: 'account',
      config: imageConfig(),
    })

    const [completed] = await tasksService.startQueuedTasks()

    expect(completed?.id).toBe(task.id)
    expect(completed?.status).toBe('succeeded')
    expect(completed?.output?.resources[0]?.role).toBe('generated_image')
    expect(completed?.output?.resources[0]?.mediaObjectId).toMatch(/^media_/)
    expect(completed?.output?.resources[0]?.url).toContain('/media/')
    const outputResources = (
      await taskRepository.listResources(task.id)
    ).filter((resource) => resource.direction === 'output')
    expect(outputResources[0]?.mediaObjectId).toBe(
      completed?.output?.resources[0]?.mediaObjectId,
    )
    expect(
      (await taskEventLog.listEvents(task.id)).map((event) => event.eventType),
    ).toEqual(['task.created', 'task.started', 'task.succeeded'])
  })

  test('resolves media object URLs only for provider start without persisting signed URLs', async () => {
    const taskEventLog = new FakeTaskEventLog()
    const taskRepository = new FakeTaskRepository()
    const modelRegistry = new ModelRegistry()
    const mediaObjectRepository = new FakeMediaObjectRepository()
    const mediaObjectService = new MediaObjectService(
      mediaObjectRepository,
      new FakeObjectStorage(),
      {
        fetch: async () => {
          throw new Error('fetcher not configured')
        },
      },
    )
    let providerTaskConfig: TaskConfig | undefined
    modelRegistry.register({
      capabilities: {
        media: { inputImages: { max: 16 } },
        output: { images: true },
      },
      key: {
        kind: 'image_generation',
        provider: 'signed-test',
        model: 'signed-image',
      },
      paramsSchema: z.object({}),
      collectInputResources: (config) => config.media.inputImages,
      getPricingInput: (config) => ({
        taskKind: config.kind,
        provider: config.provider,
        model: config.model,
        billingMetric: 'image',
        usageAmount: 1,
      }),
      getTaskMode: () => 'sync',
      parseConfig: (config) => ({
        ...config,
        params: {},
      }),
      parseTask: (providerTask) => ({
        ...providerTask,
        config: {
          ...providerTask.config,
          params: {},
        },
      }),
      poll: async () => ({ status: 'pending' }),
      prepareConfig: (input) => ({
        kind: 'image_generation',
        media: {
          inputImages: input.media.inputImages,
          referenceImages: [],
          referenceAudios: [],
          referenceVideos: [],
        },
        model: 'signed-image',
        params: {},
        prompt: input.draft.prompt,
        provider: 'signed-test',
      }),
      start: async (providerTask) => {
        providerTaskConfig = providerTask.config
        return {
          output: { resources: [], variables: {} },
          status: 'succeeded',
        }
      },
    })
    const tasksService = new TasksService(
      taskRepository,
      new PricingService(new FakePricingRepository([
        {
          id: 'price_signed_image',
          taskKind: 'image_generation',
          provider: 'signed-test',
          model: 'signed-image',
          billingMetric: 'image',
          unitPrice: 1,
          currency: 'credit',
          activeFrom: '2026-01-01T00:00:00.000Z',
          priority: 10,
        },
      ])),
      new MediaResolvingTaskProvider(
        new ProviderRouter(modelRegistry),
        new ProviderMediaUrlResolver(mediaObjectService, 14_400),
      ),
      modelRegistry,
      new TaskOutputFinalizer(mediaObjectService),
      new OutputPostProcessor(new DeterministicVideoFrameGenerator(mediaObjectService)),
      taskEventLog,
    )
    const timestamp = new Date().toISOString()
    await mediaObjectRepository.create({
      id: 'media_input',
      accountId: 'account',
      kind: 'image',
      status: 'ready',
      bucket: 'mina-test-storage',
      storageKey: 'users/account/media/media_input/original.png',
      url: 's3://mina-test-storage/users/account/media/media_input/original.png',
      mimeType: 'image/png',
      byteSize: 1,
      origin: 'user_upload',
      purpose: 'workflow_slot',
      retention: 'project_scoped',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    const task = await tasksService.createTask({
      accountId: 'account',
      config: {
        ...imageConfig(),
        model: 'signed-image',
        provider: 'signed-test',
        media: {
          inputImages: [
            {
              kind: 'image',
              role: 'reference_image',
              url: 's3://mina-test-storage/users/account/media/media_input/original.png',
              mediaObjectId: 'media_input',
              source: { type: 'media_object', mediaObjectId: 'media_input' },
            },
          ],
          referenceImages: [],
          referenceAudios: [],
          referenceVideos: [],
        },
      },
    })

    expect((await taskRepository.listResources(task.id))[0]?.url).toBe(
      's3://mina-test-storage/users/account/media/media_input/original.png',
    )
    const completed = await tasksService.runTask(task.id)

    expect(providerTaskConfig?.media.inputImages[0]?.url).toBe(
      'fake://mina-test-storage/users/account/media/media_input/original.png',
    )
    expect(completed.config.media.inputImages[0]?.url).toBe(
      's3://mina-test-storage/users/account/media/media_input/original.png',
    )
    expect((await taskRepository.findById(task.id))?.config.media.inputImages[0]?.url).toBe(
      's3://mina-test-storage/users/account/media/media_input/original.png',
    )
  })

  test('validates standalone task media through the model spec before creation', async () => {
    const { tasksService } = createService()

    await expect(
      tasksService.createTask({
        accountId: 'account',
        config: {
          kind: 'video_generation',
          provider: 'google',
          model: 'veo-3.1-generate-preview',
          prompt: 'video',
          media: {
            inputImages: [],
            lastFrame: {
              kind: 'image',
              role: 'last_frame',
              url: 'data:image/png;base64,abc',
            },
            referenceImages: [],
            referenceAudios: [],
            referenceVideos: [],
          },
          params: {},
        },
      }),
    ).rejects.toThrow('lastFrame requires firstFrame')
  })

  test('validates standalone task media capabilities before creation', async () => {
    const { tasksService } = createService()
    const referenceImages = Array.from({ length: 4 }, (_unused, index) => ({
      kind: 'image' as const,
      role: 'reference_image' as const,
      url: `data:image/png;base64,${index}`,
    }))

    await expect(
      tasksService.createTask({
        accountId: 'account',
        config: {
          kind: 'video_generation',
          provider: 'google',
          model: 'veo-3.1-generate-preview',
          prompt: 'video',
          media: {
            inputImages: [],
            referenceAudios: [],
            referenceImages,
            referenceVideos: [],
          },
          params: {},
        },
      }),
    ).rejects.toThrow('supports at most 3')
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
      config: imageConfig(),
    })

    const retried = await tasksService.startQueuedTasks()
    const failed = retried[0]

    expect(failed?.status).toBe('queued')
    expect(failed?.error).toMatchObject({
      code: 'TASK_START_RETRY',
      message: 'Provider failed.',
    })
    const events = await taskEventLog.listEvents(task.id)
    expect(events.map((event) => event.eventType)).toEqual([
      'task.created',
      'task.started',
      'task.start.retry',
    ])
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
      config: videoConfig(),
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
    expect(completed?.output?.resources[0]?.mediaObjectId).toMatch(/^media_/)
    expect(completed?.output?.resources[1]?.role).toBe('first_frame')
    expect(completed?.output?.resources[1]?.mediaObjectId).toMatch(/^media_/)
    expect(completed?.output?.resources[2]?.role).toBe('last_frame')
    expect(completed?.output?.resources[2]?.mediaObjectId).toMatch(/^media_/)
    expect(completed?.output?.resources[3]?.role).toBe('video_cover')
    expect(completed?.output?.resources[3]?.mediaObjectId).toMatch(/^media_/)

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
      config: videoConfig(),
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
