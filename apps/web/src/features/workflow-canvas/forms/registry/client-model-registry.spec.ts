import { deriveGenerationMode, deriveModelCompatibilityMode, listClientModels, paramsForSpec, resolveClientModel } from './index'

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message)
  }
}

assert(deriveModelCompatibilityMode({}) === 'text', 'empty media slots should derive text compatibility')
assert(deriveGenerationMode('image_generation', {}) === 't2i', 'empty image media slots should derive t2i')
assert(deriveGenerationMode('video_generation', {}) === 't2v', 'empty video media slots should derive t2v')
assert(deriveGenerationMode('image_generation', { inputImages: [] }) === 't2i', 'empty inputImages should derive t2i')

assert(
  deriveGenerationMode('image_generation', {
    inputImages: [
      {
        id: 'slot-item',
        order: 0,
        required: true,
        slot: 'inputImages',
        source: { type: 'media_object', mediaObjectId: 'media' },
      },
    ],
  }) === 'i2i',
  'filled media slots should derive i2i',
)

assert(
  deriveGenerationMode('video_generation', {
    firstFrame: [
      {
        id: 'slot-item',
        order: 0,
        required: true,
        slot: 'firstFrame',
        source: { type: 'media_object', mediaObjectId: 'media' },
      },
    ],
  }) === 'i2v',
  'filled video media slots should derive i2v',
)

const t2i = listClientModels('image_generation', 'text')
const i2i = listClientModels('image_generation', 'media')
const expectedModels = [
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview',
  'doubao-seedream-5-0-260128',
  'doubao-seedream-4-5-251128',
]

assert(JSON.stringify(t2i.map((spec) => spec.key.model)) === JSON.stringify(expectedModels), 't2i registry mismatch')
assert(JSON.stringify(i2i.map((spec) => spec.key.model)) === JSON.stringify(expectedModels), 'i2i registry mismatch')
assert(!t2i.some((spec) => spec.key.model === 'dev-image'), 'dev-image must not be registered in the client registry')

const t2v = listClientModels('video_generation', 'text')
const i2v = listClientModels('video_generation', 'media')
const expectedVideoModels = [
  'veo-3.1-generate-preview',
  'veo-3.1-fast-generate-preview',
  'doubao-seedance-2-0-260128',
  'doubao-seedance-1-5-pro-251215',
  'jimeng-video-seedance-2.0',
  'jimeng-video-seedance-2.0-fast',
]

assert(JSON.stringify(t2v.map((spec) => spec.key.model)) === JSON.stringify(expectedVideoModels), 't2v registry mismatch')
assert(JSON.stringify(i2v.map((spec) => spec.key.model)) === JSON.stringify(expectedVideoModels), 'i2v registry mismatch')
assert(!t2v.some((spec) => spec.key.model === 'dev-video'), 'dev-video must not be registered in the client registry')

assert(
  resolveClientModel({
    kind: 'image_generation',
    provider: 'google',
    model: 'gemini-3.1-flash-image-preview',
  })?.displayName === 'Gemini 3.1 Flash Image',
  'registered Gemini model should resolve',
)
assert(
  !resolveClientModel({
    kind: 'image_generation',
    provider: 'dev',
    model: 'dev-image',
  }),
  'unregistered dev-image should not resolve',
)
assert(
  resolveClientModel({
    kind: 'video_generation',
    provider: 'google',
    model: 'veo-3.1-generate-preview',
  })?.displayName === 'Veo 3.1',
  'registered Veo model should resolve',
)
assert(
  !resolveClientModel({
    kind: 'video_generation',
    provider: 'dev',
    model: 'dev-video',
  }),
  'unregistered dev-video should not resolve',
)

const geminiPro = resolveClientModel({
  kind: 'image_generation',
  provider: 'google',
  model: 'gemini-3-pro-image-preview',
})
assert(Boolean(geminiPro), 'Gemini Pro should resolve')
assert(
  !Object.hasOwn(paramsForSpec({ count: 2, imageSearch: true, thinkingLevel: 'high' }, geminiPro!), 'imageSearch'),
  'paramsForSpec should drop unsupported params',
)
assert(
  paramsForSpec({ count: 2, imageSearch: true, thinkingLevel: 'high' }, geminiPro!).count === 2,
  'paramsForSpec should preserve supported params',
)

console.log('client model registry checks passed')
