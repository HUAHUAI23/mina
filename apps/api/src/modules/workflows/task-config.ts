import type {
  MediaInput,
  TaskConfig,
  VideoGenerationConfig,
} from '@mina/contracts/modules/tasks'
import type { MediaSlotConnection } from '@mina/contracts/modules/canvas'

export const buildImageTaskConfig = (
  baseConfig: TaskConfig,
  inputs: MediaInput[],
): TaskConfig => {
  if (baseConfig.kind !== 'image_generation') {
    throw new Error('Node task config is not an image generation config.')
  }

  if (inputs.length === 0) {
    return baseConfig
  }

  return {
    kind: 'image_generation',
    mode: 'image_to_image',
    provider: baseConfig.provider,
    model: baseConfig.model,
    prompt: baseConfig.prompt,
    size: baseConfig.size,
    count: baseConfig.count,
    inputImages: [...(baseConfig.mode === 'image_to_image' ? baseConfig.inputImages : []), ...inputs],
  }
}

export const buildVideoTaskConfig = (
  baseConfig: VideoGenerationConfig,
  inputsBySlot: Partial<Record<MediaSlotConnection['targetSlot'], MediaInput[]>>,
): VideoGenerationConfig => ({
  ...baseConfig,
  ...(inputsBySlot.firstFrame?.[0] ? { firstFrame: inputsBySlot.firstFrame[0] } : {}),
  ...(inputsBySlot.lastFrame?.[0] ? { lastFrame: inputsBySlot.lastFrame[0] } : {}),
  referenceImages: [...baseConfig.referenceImages, ...(inputsBySlot.referenceImages ?? [])],
  referenceAudios: [...baseConfig.referenceAudios, ...(inputsBySlot.referenceAudios ?? [])],
  referenceVideos: [...baseConfig.referenceVideos, ...(inputsBySlot.referenceVideos ?? [])],
})

export const collectInputResources = (config: TaskConfig): MediaInput[] => {
  if (config.kind === 'image_generation') {
    return config.mode === 'image_to_image' ? config.inputImages : []
  }

  return [
    config.firstFrame,
    config.lastFrame,
    ...config.referenceImages,
    ...config.referenceAudios,
    ...config.referenceVideos,
  ].filter((input): input is MediaInput => input !== undefined)
}
