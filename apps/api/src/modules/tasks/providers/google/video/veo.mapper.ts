import type { NodeExecutionOutput, NodeOutputResource } from '@mina/contracts/modules/tasks'

import type { GoogleVideoOperation } from '../common/client'

export interface GoogleVeoRequestInput {
  aspectRatio: string
  durationSeconds: number
  firstFrame?: { data: string; mimeType: string }
  lastFrame?: { data: string; mimeType: string }
  personGeneration: string
  prompt: string
  referenceImages: Array<{ data: string; mimeType: string }>
  resolution: string
}

const inlineData = (media: { data: string; mimeType: string }) => ({
  inlineData: {
    data: media.data,
    mimeType: media.mimeType,
  },
})

export const buildGoogleVeoRequest = (input: GoogleVeoRequestInput): Record<string, unknown> => {
  const instance: Record<string, unknown> = {
    prompt: input.prompt,
  }
  if (input.firstFrame) {
    instance.image = inlineData(input.firstFrame)
  }
  if (input.lastFrame) {
    instance.lastFrame = inlineData(input.lastFrame)
  }
  if (input.referenceImages.length > 0) {
    instance.referenceImages = input.referenceImages.map((image) => ({
      image: inlineData(image),
      referenceType: 'asset',
    }))
  }

  return {
    instances: [instance],
    parameters: {
      aspectRatio: input.aspectRatio,
      durationSeconds: String(input.durationSeconds),
      personGeneration: input.personGeneration,
      resolution: input.resolution,
    },
  }
}

export const googleVeoOutputFromOperation = (taskId: string, operation: GoogleVideoOperation): NodeExecutionOutput => {
  const resources: NodeOutputResource[] =
    operation.response?.generateVideoResponse?.generatedSamples
      ?.flatMap((sample) => (sample.video?.uri ? [sample.video.uri] : []))
      .map((url, index) => ({
        id: `${taskId}:video:${index}`,
        kind: 'video',
        role: 'generated_video',
        index,
        url,
        metadata: {
          downloadAuth: 'google-api-key',
        },
      })) ?? []

  if (resources.length === 0) {
    throw new Error('Google Veo operation succeeded without video output.')
  }

  return {
    resources,
    variables: {
      videoUrls: resources.map((resource) => resource.url),
    },
  }
}
