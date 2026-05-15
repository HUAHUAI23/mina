import type { NodeExecutionOutput, NodeOutputResource } from '@mina/contracts/modules/tasks'

export interface VolcengineGeneratedImage {
  b64_json?: string
  index?: number
  output_format?: 'png' | 'jpeg'
  revised_prompt?: string
  url?: string
}

export interface VolcengineSeedreamRequestInput {
  count: number
  images: string[]
  maxImages?: number
  model: string
  optimizePrompt: boolean
  outputFormat?: 'png' | 'jpeg'
  responseFormat?: 'url' | 'b64_json'
  sequentialImageGeneration?: 'auto' | 'disabled'
  size: string
  watermark?: boolean
  webSearch: boolean
}

export const buildVolcengineSeedreamRequest = (
  prompt: string,
  input: VolcengineSeedreamRequestInput,
): Record<string, unknown> => {
  const body: Record<string, unknown> = {
    model: input.model,
    prompt,
    response_format: input.responseFormat ?? 'url',
    size: input.size,
  }
  if (input.images.length > 0) {
    body.image = input.images.length === 1 ? input.images[0] : input.images
  }
  if (input.outputFormat) {
    body.output_format = input.outputFormat
  }
  if (input.sequentialImageGeneration) {
    body.sequential_image_generation = input.sequentialImageGeneration
    if (input.maxImages) {
      body.sequential_image_generation_options = { max_images: input.maxImages }
    }
  }
  if (input.optimizePrompt) {
    body.optimize_prompt_options = { mode: 'standard' }
  }
  if (input.watermark !== undefined) {
    body.watermark = input.watermark
  }
  if (input.webSearch) {
    body.tools = [{ type: 'web_search' }]
  }
  return body
}

export const volcengineSeedreamOutputFromImages = (
  taskId: string,
  images: VolcengineGeneratedImage[],
): NodeExecutionOutput => {
  const resources: NodeOutputResource[] = images.map((image, index) => ({
    id: `${taskId}:image:${index}`,
    kind: 'image',
    role: 'generated_image',
    index,
    url: image.url ?? `data:image/${image.output_format ?? 'png'};base64,${image.b64_json ?? ''}`,
    metadata: {
      ...(image.output_format ? { outputFormat: image.output_format } : {}),
      ...(image.revised_prompt ? { revisedPrompt: image.revised_prompt } : {}),
    },
  }))

  if (resources.length === 0) {
    throw new Error('Volcengine Seedream returned no image output.')
  }

  return {
    resources,
    variables: {
      imageUrls: resources.map((resource) => resource.url),
    },
  }
}
