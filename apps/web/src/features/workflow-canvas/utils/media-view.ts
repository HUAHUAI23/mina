import type { NodeMediaViewState } from '@mina/contracts/modules/canvas'
import type { NodeExecutionOutput, NodeOutputResource } from '@mina/contracts/modules/tasks'

export const resolveMediaViewResource = (
  output: NodeExecutionOutput | undefined,
  mediaView: NodeMediaViewState | undefined,
): NodeOutputResource | undefined => {
  if (!output?.resources.length) {
    return undefined
  }
  if (mediaView?.outputResourceId) {
    const byId = output.resources.find((resource) => resource.id === mediaView.outputResourceId)
    if (byId) {
      return byId
    }
  }
  if (mediaView?.outputIndex !== undefined) {
    return output.resources[mediaView.outputIndex]
  }
  return output.resources[0]
}

export const selectableResources = (output: NodeExecutionOutput | undefined): NodeOutputResource[] =>
  output?.resources.filter((resource) => resource.kind === 'image' || resource.kind === 'video') ?? []

export const primarySelectableResources = (output: NodeExecutionOutput | undefined): NodeOutputResource[] =>
  output?.resources.filter((resource) => resource.role === 'generated_image' || resource.role === 'generated_video') ?? []

export const videoPosterResource = (
  output: NodeExecutionOutput | undefined,
  video: NodeOutputResource | undefined,
): NodeOutputResource | undefined => {
  if (!output?.resources.length) {
    return undefined
  }
  const sourceVideoId = video?.id
  const videoCount = output.resources.filter((resource) => resource.kind === 'video' && resource.role === 'generated_video').length
  const matchesVideo = (resource: NodeOutputResource): boolean =>
    resource.metadata?.sourceVideoResourceId === sourceVideoId ||
    resource.metadata?.sourceFirstFrameVideoResourceId === sourceVideoId ||
    resource.metadata?.sourceLastFrameVideoResourceId === sourceVideoId
  const byRole = (role: NodeOutputResource['role']) => {
    const resources = output.resources.filter((resource) => resource.kind === 'image' && resource.role === role)
    if (resources.length === 0) {
      return undefined
    }
    if (!sourceVideoId) {
      return resources[0]
    }
    return resources.find(matchesVideo) ?? (videoCount <= 1 ? resources[0] : undefined)
  }
  return byRole('video_cover') ?? byRole('first_frame') ?? byRole('last_frame')
}
