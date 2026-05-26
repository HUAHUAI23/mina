import { describe, expect, test } from 'bun:test'

import { DevImageSpec } from '../providers/dev/image.spec'
import { ModelRegistry } from '../models/model-registry'
import { TaskConfigAssembler } from './task-config-assembler'
import { TaskConfigValidationError } from './validation-error'

const createAssembler = () => {
  const registry = new ModelRegistry()
  registry.register(new DevImageSpec())
  return new TaskConfigAssembler(registry)
}

describe('TaskConfigAssembler', () => {
  test('rejects runnable task drafts with an empty prompt', () => {
    expect(() =>
      createAssembler().prepare({
        draft: {
          kind: 'image_generation',
          provider: 'dev',
          model: 'dev-image',
          prompt: '',
          params: {},
        },
        media: {
          inputImages: [],
          referenceImages: [],
          referenceAudios: [],
          referenceVideos: [],
        },
      }),
    ).toThrow(TaskConfigValidationError)
  })

  test('prepares runnable task drafts with a non-empty prompt', () => {
    const config = createAssembler().prepare({
      draft: {
        kind: 'image_generation',
        provider: 'dev',
        model: 'dev-image',
        prompt: 'Generate an image',
        params: {},
      },
      media: {
        inputImages: [],
        referenceImages: [],
        referenceAudios: [],
        referenceVideos: [],
      },
    })

    expect(config.prompt).toBe('Generate an image')
  })
})
