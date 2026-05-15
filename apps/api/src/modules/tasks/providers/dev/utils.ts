import type { NodeExecutionOutput, NodeOutputResource } from '@mina/contracts/modules/tasks'

export const outputUrl = (taskId: string, index: number, extension: string): string =>
  `mina://tasks/${taskId}/outputs/${index}.${extension}`

export const buildVariables = (resources: NodeOutputResource[]): NodeExecutionOutput['variables'] => {
  const imageUrls = resources.filter((resource) => resource.kind === 'image').map((resource) => resource.url)
  const videoUrls = resources.filter((resource) => resource.kind === 'video').map((resource) => resource.url)
  const videoCoverUrls = resources.filter((resource) => resource.role === 'video_cover').map((resource) => resource.url)
  const audioUrls = resources.filter((resource) => resource.kind === 'audio').map((resource) => resource.url)
  const lastFrameUrls = resources.filter((resource) => resource.role === 'last_frame').map((resource) => resource.url)

  return {
    ...(imageUrls.length > 0 ? { imageUrls } : {}),
    ...(videoUrls.length > 0 ? { videoUrls } : {}),
    ...(videoCoverUrls.length > 0 ? { videoCoverUrls } : {}),
    ...(audioUrls.length > 0 ? { audioUrls } : {}),
    ...(lastFrameUrls.length > 0 ? { lastFrameUrls } : {}),
  }
}
