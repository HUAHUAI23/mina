import type {
  MediaInput,
  MediaSlotConnection,
  NodeExecutionOutput,
  NodeOutputResource,
  ResourceKind,
  ResourceRef,
  ResourceRole,
  TaskConfig,
  VideoGenerationConfig,
} from '@mina/contracts'

export interface ResolvedMediaInput {
  input: MediaInput
  targetSlot: MediaSlotConnection['targetSlot']
}

export const isNodeOutputResource = (resource: NodeOutputResource | ResourceRef): resource is NodeOutputResource =>
  typeof resource.id === 'string' && typeof resource.index === 'number' && resource.role !== undefined

export const slotToInputRole = (slot: MediaSlotConnection['targetSlot']): ResourceRole => {
  if (slot === 'firstFrame') return 'first_frame'
  if (slot === 'lastFrame') return 'last_frame'
  if (slot === 'referenceAudios') return 'reference_audio'
  if (slot === 'referenceVideos') return 'reference_video'
  return 'reference_image'
}

export const slotToResourceKind = (slot: MediaSlotConnection['targetSlot']): ResourceKind | undefined => {
  if (slot === 'referenceAudios') return 'audio'
  if (slot === 'referenceVideos') return 'video'
  if (slot === 'prompt') return undefined
  return 'image'
}

export const mediaInputFromOutput = (
  resource: NodeOutputResource,
  role: ResourceRole,
  source: MediaInput['source'],
): MediaInput => ({
  kind: resource.kind,
  url: resource.url,
  role,
  source,
  ...(resource.metadata ? { metadata: resource.metadata } : {}),
})

export const mediaInputFromResourceRef = (resource: ResourceRef, role: ResourceRole): MediaInput => ({
  kind: resource.kind,
  url: resource.url,
  role,
  ...(resource.metadata ? { metadata: resource.metadata } : {}),
})

export const findOutputBySelector = (
  output: NodeExecutionOutput,
  resourceKind: ResourceKind,
  role: ResourceRole,
  index: number,
): NodeOutputResource | undefined =>
  output.resources.find(
    (resource) => resource.kind === resourceKind && resource.role === role && resource.index === index,
  )

export const findOutputByMediaView = (
  output: NodeExecutionOutput,
  outputResourceId: string | undefined,
  outputIndex: number | undefined,
): NodeOutputResource | undefined => {
  if (outputResourceId) {
    const byId = output.resources.find((resource) => resource.id === outputResourceId)
    if (byId) {
      return byId
    }
  }

  if (outputIndex !== undefined) {
    return output.resources[outputIndex]
  }

  return output.resources[0]
}

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
