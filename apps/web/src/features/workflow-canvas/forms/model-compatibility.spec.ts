import { expect, test } from 'bun:test'

import { formValuesEqual, formValueWithCompatibleModel, taskWithCompatibleModel } from './model-compatibility'
import { mediaSlotsForNodeType, normalizeMediaSlotsForNodeType } from '../domain/media-slot-policy'
import { resolveClientModel } from './registry/client-model-registry'

test('legacy image tasks fall back to a compatible registered model', () => {
  const legacyImageTask = {
    kind: 'image_generation' as const,
    model: 'dev-image',
    params: { count: 1, size: '1024x1024' },
    prompt: 'Keep this prompt',
    provider: 'dev',
  }

  const nextImageTask = taskWithCompatibleModel(legacyImageTask, {
    inputImages: [
      {
        id: 'slot-item',
        order: 0,
        required: true,
        slot: 'inputImages',
        source: { type: 'media_object' as const, mediaObjectId: 'media' },
      },
    ],
  })

  expect(nextImageTask.provider).toBe('google')
  expect(nextImageTask.model).toBe('gemini-3.1-flash-image-preview')
  expect(nextImageTask.prompt).toBe(legacyImageTask.prompt)
  expect(nextImageTask.params.count).toBe(1)
  expect(Object.hasOwn(nextImageTask.params, 'size')).toBe(false)
})

test('legacy video tasks fall back to a compatible registered model', () => {
  const legacyVideoTask = {
    kind: 'video_generation' as const,
    model: 'dev-video',
    params: { durationSeconds: 5, outputLastFrame: false, resolution: '720p' },
    prompt: 'Move the camera',
    provider: 'dev',
  }

  const nextVideoTask = taskWithCompatibleModel(legacyVideoTask, {
    firstFrame: [
      {
        id: 'slot-item',
        order: 0,
        required: true,
        slot: 'firstFrame',
        source: { type: 'media_object' as const, mediaObjectId: 'media' },
      },
    ],
  })

  expect(nextVideoTask.provider).toBe('google')
  expect(nextVideoTask.model).toBe('veo-3.1-generate-preview')
  expect(nextVideoTask.prompt).toBe(legacyVideoTask.prompt)
  expect(nextVideoTask.params.durationSeconds).toBe(5)
  expect(Object.hasOwn(nextVideoTask.params, 'outputLastFrame')).toBe(false)
})

test('compatible form normalization preserves remote prompt changes', () => {
  const remotePromptValue = formValueWithCompatibleModel(
    {
      kind: 'image_generation',
      model: 'gemini-3.1-flash-image-preview',
      params: { aspectRatio: '1:1', count: 1, imageSize: '1K' },
      prompt: 'Remote prompt',
      provider: 'google',
    },
    {},
  )

  expect(remotePromptValue.prompt).toBe('Remote prompt')
  expect(formValuesEqual(
    {
      kind: 'image_generation',
      model: 'gemini-3.1-flash-image-preview',
      params: { aspectRatio: '1:1', count: 1, imageSize: '1K' },
      prompt: 'Local prompt',
      provider: 'google',
    },
    remotePromptValue,
  )).toBe(false)
})

test('media slot normalization preserves compatible cross-kind slots only', () => {
  const incompatibleSlots = normalizeMediaSlotsForNodeType('video_generation', {
    firstFrame: [
      {
        id: 'compatible-video-slot',
        order: 0,
        required: true,
        slot: 'firstFrame',
        source: { type: 'media_object' as const, mediaObjectId: 'media_1' },
      },
    ],
    inputImages: [
      {
        id: 'image-only-slot',
        order: 0,
        required: true,
        slot: 'inputImages',
        source: { type: 'media_object' as const, mediaObjectId: 'media_2' },
      },
    ],
  })

  expect(incompatibleSlots.firstFrame).toHaveLength(1)
  expect(incompatibleSlots.inputImages?.length ?? 0).toBe(0)
})

test('model media capabilities expose and constrain supported reference slots', () => {
  const seedanceProSpec = resolveClientModel({
    kind: 'video_generation',
    model: 'doubao-seedance-1-5-pro-251215',
    provider: 'volcengine',
  })
  expect(seedanceProSpec).toBeDefined()

  const seedanceProSlots = mediaSlotsForNodeType('video_generation', seedanceProSpec?.mediaCapabilities)
  expect(seedanceProSlots.some((descriptor) => descriptor.slot === 'referenceImages')).toBe(true)
  expect(seedanceProSlots.some((descriptor) => descriptor.slot === 'referenceAudios')).toBe(false)
  expect(seedanceProSlots.some((descriptor) => descriptor.slot === 'referenceVideos')).toBe(false)

  const limitedReferenceSlots = normalizeMediaSlotsForNodeType('video_generation', {
    referenceImages: Array.from({ length: 4 }, (_unused, index) => ({
      id: `reference_${index}`,
      order: index,
      required: true,
      slot: 'referenceImages' as const,
      source: { type: 'media_object' as const, mediaObjectId: `media_${index}` },
    })),
  }, seedanceProSpec?.mediaCapabilities)
  expect(limitedReferenceSlots.referenceImages).toHaveLength(2)
})
