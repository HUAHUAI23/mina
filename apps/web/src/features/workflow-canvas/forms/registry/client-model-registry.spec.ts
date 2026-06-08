import { expect, test } from 'bun:test'

import {
  createClientModelRegistry,
  deriveGenerationMode,
  deriveModelCompatibilityMode,
  listClientModels,
  paramsForSpec,
  resolveClientModel,
} from './client-model-registry'
import './index'
import { imageClientModelSpecs } from './image-specs'

const expectedModels = [
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview',
  'doubao-seedream-5-0-260128',
  'doubao-seedream-4-5-251128',
]

const expectedVideoModels = [
  'veo-3.1-generate-preview',
  'veo-3.1-fast-generate-preview',
  'doubao-seedance-2-0-260128',
  'doubao-seedance-1-5-pro-251215',
  'jimeng-video-seedance-2.0',
  'jimeng-video-seedance-2.0-fast',
]

test('media slots derive text and media generation modes', () => {
  expect(deriveModelCompatibilityMode({})).toBe('text')
  expect(deriveGenerationMode('image_generation', {})).toBe('t2i')
  expect(deriveGenerationMode('video_generation', {})).toBe('t2v')
  expect(deriveGenerationMode('image_generation', { inputImages: [] })).toBe('t2i')
  expect(deriveGenerationMode('image_generation', {
    inputImages: [
      {
        id: 'slot-item',
        order: 0,
        required: true,
        slot: 'inputImages',
        source: { type: 'media_object', mediaObjectId: 'media' },
      },
    ],
  })).toBe('i2i')
  expect(deriveGenerationMode('video_generation', {
    firstFrame: [
      {
        id: 'slot-item',
        order: 0,
        required: true,
        slot: 'firstFrame',
        source: { type: 'media_object', mediaObjectId: 'media' },
      },
    ],
  })).toBe('i2v')
})

test('client registry lists production image and video models in configured order', () => {
  const t2i = listClientModels('image_generation', 'text')
  const i2i = listClientModels('image_generation', 'media')
  const t2v = listClientModels('video_generation', 'text')
  const i2v = listClientModels('video_generation', 'media')

  expect(t2i.map((spec) => spec.key.model)).toEqual(expectedModels)
  expect(i2i.map((spec) => spec.key.model)).toEqual(expectedModels)
  expect(t2i.some((spec) => spec.key.model === 'dev-image')).toBe(false)
  expect(t2v.map((spec) => spec.key.model)).toEqual(expectedVideoModels)
  expect(i2v.map((spec) => spec.key.model)).toEqual(expectedVideoModels)
  expect(t2v.some((spec) => spec.key.model === 'dev-video')).toBe(false)
})

test('client registry resolves registered models and rejects removed dev models', () => {
  expect(resolveClientModel({
    kind: 'image_generation',
    provider: 'google',
    model: 'gemini-3.1-flash-image-preview',
  })?.displayName).toBe('Gemini 3.1 Flash Image')
  expect(resolveClientModel({
    kind: 'image_generation',
    provider: 'dev',
    model: 'dev-image',
  })).toBeUndefined()
  expect(resolveClientModel({
    kind: 'video_generation',
    provider: 'google',
    model: 'veo-3.1-generate-preview',
  })?.displayName).toBe('Veo 3.1')
  expect(resolveClientModel({
    kind: 'video_generation',
    provider: 'dev',
    model: 'dev-video',
  })).toBeUndefined()
})

test('paramsForSpec drops unsupported params while preserving supported params', () => {
  const geminiPro = resolveClientModel({
    kind: 'image_generation',
    provider: 'google',
    model: 'gemini-3-pro-image-preview',
  })
  expect(geminiPro).toBeDefined()
  expect(Object.hasOwn(paramsForSpec({ count: 2, imageSearch: true, thinkingLevel: 'high' }, geminiPro!), 'imageSearch')).toBe(false)
  expect(paramsForSpec({ count: 2, imageSearch: true, thinkingLevel: 'high' }, geminiPro!).count).toBe(2)
  expect(Object.hasOwn(paramsForSpec({ optimizePrompt: true, webSearch: true }, resolveClientModel({
    kind: 'image_generation',
    provider: 'volcengine',
    model: 'doubao-seedream-4-5-251128',
  })!), 'webSearch')).toBe(false)
})

test('isolated client registries do not inherit or mutate default registrations', () => {
  const isolatedRegistry = createClientModelRegistry([imageClientModelSpecs[0]!])

  expect(isolatedRegistry.listModels('image_generation', 'text')).toHaveLength(1)
  expect(isolatedRegistry.resolve({
    kind: 'image_generation',
    provider: 'volcengine',
    model: 'doubao-seedream-5-0-260128',
  })).toBeUndefined()
  expect(listClientModels('image_generation', 'text')).toHaveLength(expectedModels.length)
})
