import { formValuesEqual, formValueWithCompatibleModel, taskWithCompatibleModel } from './model-compatibility'
import { normalizeMediaSlotsForNodeType } from '../domain/media-slot-policy'

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message)
  }
}

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

assert(nextImageTask.provider === 'google', 'legacy image provider should fall back to first registered image provider')
assert(nextImageTask.model === 'gemini-3.1-flash-image-preview', 'legacy image model should fall back to Gemini Flash')
assert(nextImageTask.prompt === legacyImageTask.prompt, 'fallback should preserve prompt')
assert(nextImageTask.params.count === 1, 'fallback should preserve compatible params')
assert(!Object.hasOwn(nextImageTask.params, 'size'), 'fallback should drop unsupported params')

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

assert(nextVideoTask.provider === 'google', 'legacy video provider should fall back to first registered video provider')
assert(nextVideoTask.model === 'veo-3.1-generate-preview', 'legacy video model should fall back to Veo')
assert(nextVideoTask.prompt === legacyVideoTask.prompt, 'video fallback should preserve prompt')
assert(nextVideoTask.params.durationSeconds === 5, 'video fallback should preserve compatible params')
assert(!Object.hasOwn(nextVideoTask.params, 'outputLastFrame'), 'video fallback should drop unsupported params')

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

assert(remotePromptValue.prompt === 'Remote prompt', 'compatible form normalization should preserve remote prompt')
assert(
  !formValuesEqual(
    {
      kind: 'image_generation',
      model: 'gemini-3.1-flash-image-preview',
      params: { aspectRatio: '1:1', count: 1, imageSize: '1K' },
      prompt: 'Local prompt',
      provider: 'google',
    },
    remotePromptValue,
  ),
  'formValuesEqual should catch same-model remote prompt changes',
)

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

assert(incompatibleSlots.firstFrame?.length === 1, 'cross-kind media slot normalization should preserve compatible slots')
assert(!incompatibleSlots.inputImages?.length, 'cross-kind media slot normalization should remove incompatible slots')

console.log('model compatibility checks passed')
