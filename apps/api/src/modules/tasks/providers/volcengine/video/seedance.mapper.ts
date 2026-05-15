import type { NodeExecutionOutput, NodeOutputResource } from '@mina/contracts/modules/tasks'
import type { VolcengineVideoTaskResponse } from '../common/client'

export interface VolcengineSeedanceRequestInput {
  cameraFixed?: boolean
  durationSeconds: number
  generateAudio?: boolean
  media: Array<{
    kind: 'image' | 'video' | 'audio'
    role: string
    url: string
  }>
  model: string
  ratio: string
  resolution: string
  returnLastFrame: boolean
  serviceTier?: 'default' | 'flex'
  webSearch: boolean
}

export const buildVolcengineSeedanceRequest = (
  prompt: string,
  input: VolcengineSeedanceRequestInput,
): Record<string, unknown> => {
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: prompt }]
  for (const item of input.media) {
    if (item.kind === 'image') {
      content.push({ type: 'image_url', image_url: { url: item.url }, role: item.role })
    } else if (item.kind === 'video') {
      content.push({ type: 'video_url', video_url: { url: item.url }, role: item.role })
    } else {
      content.push({ type: 'audio_url', audio_url: { url: item.url }, role: item.role })
    }
  }

  return {
    model: input.model,
    content,
    duration: input.durationSeconds,
    ratio: input.ratio,
    resolution: input.resolution,
    return_last_frame: input.returnLastFrame,
    ...(input.cameraFixed !== undefined ? { camera_fixed: input.cameraFixed } : {}),
    ...(input.generateAudio !== undefined ? { generate_audio: input.generateAudio } : {}),
    ...(input.serviceTier ? { service_tier: input.serviceTier } : {}),
    ...(input.webSearch ? { tools: [{ type: 'web_search' }] } : {}),
  }
}

export const volcengineSeedanceOutputFromTask = (
  taskId: string,
  response: VolcengineVideoTaskResponse,
): NodeExecutionOutput => {
  if (!response.content?.video_url) {
    throw new Error('Volcengine Seedance succeeded without video output.')
  }

  const resources: NodeOutputResource[] = [
    {
      id: `${taskId}:video:0`,
      kind: 'video',
      role: 'generated_video',
      index: 0,
      url: response.content.video_url,
    },
  ]
  if (response.content.last_frame_url) {
    resources.push({
      id: `${taskId}:last-frame:0`,
      kind: 'image',
      role: 'last_frame',
      index: 1,
      url: response.content.last_frame_url,
    })
  }

  return {
    resources,
    variables: {
      lastFrameUrls: resources.filter((resource) => resource.role === 'last_frame').map((resource) => resource.url),
      videoUrls: [response.content.video_url],
    },
  }
}
