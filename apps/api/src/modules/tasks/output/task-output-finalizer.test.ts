import { describe, expect, test } from 'bun:test'
import type { Task } from '@mina/contracts/modules/tasks'

import { createMediaObjectTestScenario } from '../../../test/scenarios/media-object-scenario'
import { TaskOutputFinalizer } from './task-output-finalizer'

const task = (): Task => ({
  id: 'task_1',
  accountId: 'account_1',
  kind: 'image_generation',
  mode: 'sync',
  provider: 'dev',
  model: 'dev-image',
  status: 'running',
  config: {
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
    params: {},
  },
  cost: {
    estimatedCost: 1,
    usage: {
      amount: 1,
      metric: 'image',
    },
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})

const createFinalizer = () => {
  const { service: mediaObjectService } = createMediaObjectTestScenario({
    fetcher: {
      fetch: async () => ({
        body: new TextEncoder().encode('remote-output'),
        byteSize: 13,
        contentType: 'image/png',
      }),
    },
  })
  return { finalizer: new TaskOutputFinalizer(mediaObjectService), mediaObjectService }
}

describe('TaskOutputFinalizer', () => {
  test('mirrors data URL outputs to media objects', async () => {
    const { finalizer } = createFinalizer()
    const output = await finalizer.finalize(task(), {
      resources: [
        {
          id: 'task_1:image:0',
          kind: 'image',
          role: 'generated_image',
          index: 0,
          url: 'data:image/png;base64,aW1hZ2U=',
        },
      ],
      variables: {},
    })

    expect(output.resources[0]?.mediaObjectId).toMatch(/^media_/)
    expect(output.resources[0]?.url).toContain('/media/')
  })

  test('converts dev provider mina task outputs to deterministic media objects', async () => {
    const { finalizer } = createFinalizer()
    const output = await finalizer.finalize(task(), {
      resources: [
        {
          id: 'task_1:image:0',
          kind: 'image',
          role: 'generated_image',
          index: 0,
          url: 'mina://tasks/task_1/outputs/0.png',
        },
      ],
      variables: {},
    })

    expect(output.resources[0]?.mediaObjectId).toMatch(/^media_/)
    expect(output.resources[0]?.url).toContain('/media/')
  })

  test('mirrors HTTP outputs through the remote fetcher', async () => {
    const { finalizer } = createFinalizer()
    const output = await finalizer.finalize(task(), {
      resources: [
        {
          id: 'task_1:image:0',
          kind: 'image',
          role: 'generated_image',
          index: 0,
          url: 'https://cdn.test/output.png',
        },
      ],
      variables: {},
    })

    expect(output.resources[0]?.mediaObjectId).toMatch(/^media_/)
    expect(output.resources[0]?.url).toContain('/media/')
  })

  test('fails task output finalization on unsupported output URLs', async () => {
    const { finalizer } = createFinalizer()

    await expect(
      finalizer.finalize(task(), {
        resources: [
          {
            id: 'task_1:image:0',
            kind: 'image',
            role: 'generated_image',
            index: 0,
            url: 'ftp://cdn.test/output.png',
          },
        ],
        variables: {},
      }),
    ).rejects.toThrow('Unsupported output URL')
  })

  test('reuses existing Mina media object URLs', async () => {
    const { finalizer, mediaObjectService } = createFinalizer()
    const mediaObject = await mediaObjectService.createFromBuffer({
      accountId: 'account_1',
      body: new TextEncoder().encode('image'),
      kind: 'image',
      mimeType: 'image/png',
      origin: 'task_output',
      purpose: 'task_output',
      retention: 'task_scoped',
    })
    const output = await finalizer.finalize(task(), {
      resources: [
        {
          id: 'task_1:image:0',
          kind: 'image',
          role: 'generated_image',
          index: 0,
          url: `mina://media/${mediaObject.id}`,
        },
      ],
      variables: {},
    })

    expect(output.resources[0]?.mediaObjectId).toBe(mediaObject.id)
    expect(output.resources[0]?.url).toBe(mediaObject.url)
  })
})
