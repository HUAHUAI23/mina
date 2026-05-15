import type { NodeExecutionOutput, NodeOutputResource } from '@mina/contracts/modules/tasks'

import type { GeminiApiResponse } from '../common/client'

export interface GoogleGeminiImageRequestInput {
  aspectRatio: string
  imageSearch: boolean
  imageSize: string
  includeThoughts: boolean
  prompt: string
  referenceImages: Array<{ data: string; mimeType: string }>
  thinkingLevel?: string
  webSearch: boolean
}

export const buildGoogleGeminiImageRequest = (input: GoogleGeminiImageRequestInput): Record<string, unknown> => {
  const parts: Array<Record<string, unknown>> = [{ text: input.prompt }]
  for (const image of input.referenceImages) {
    parts.push({
      inline_data: {
        data: image.data,
        mime_type: image.mimeType,
      },
    })
  }

  const generationConfig: Record<string, unknown> = {
    imageConfig: {
      aspectRatio: input.aspectRatio,
      imageSize: input.imageSize,
    },
    responseModalities: ['IMAGE'],
  }
  if (input.thinkingLevel || input.includeThoughts) {
    generationConfig.thinkingConfig = {
      ...(input.thinkingLevel ? { thinkingLevel: input.thinkingLevel } : {}),
      ...(input.includeThoughts ? { includeThoughts: true } : {}),
    }
  }

  const payload: Record<string, unknown> = {
    contents: [{ parts }],
    generationConfig,
  }
  const searchTypes: Record<string, Record<string, never>> = {}
  if (input.webSearch) {
    searchTypes.webSearch = {}
  }
  if (input.imageSearch) {
    searchTypes.imageSearch = {}
  }
  if (Object.keys(searchTypes).length > 0) {
    payload.tools = [{ google_search: { searchTypes } }]
  }
  return payload
}

export const googleGeminiImageOutputFromResponse = (
  taskId: string,
  response: GeminiApiResponse,
): NodeExecutionOutput => {
  const resources: NodeOutputResource[] = []
  for (const candidate of response.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.thought === true || !part.inlineData) {
        continue
      }
      resources.push({
        id: `${taskId}:image:${resources.length}`,
        kind: 'image',
        role: 'generated_image',
        index: resources.length,
        url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
        metadata: {
          mimeType: part.inlineData.mimeType,
          ...(part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {}),
        },
      })
    }
  }

  if (resources.length === 0) {
    throw new Error('Google Gemini image generation returned no image output.')
  }

  return {
    resources,
    variables: {
      imageUrls: resources.map((resource) => resource.url),
    },
  }
}
