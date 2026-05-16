import type { NodeExecutionOutput, NodeOutputResource, Task } from '@mina/contracts/modules/tasks'

import type { VideoFrameGenerator, VideoFrameRole } from './video-frame-generator'

export const buildOutputVariables = (resources: NodeOutputResource[]): NodeExecutionOutput['variables'] => {
  const imageUrls = resources.filter((resource) => resource.kind === 'image').map((resource) => resource.url)
  const videoUrls = resources.filter((resource) => resource.kind === 'video').map((resource) => resource.url)
  const videoCoverUrls = resources.filter((resource) => resource.role === 'video_cover').map((resource) => resource.url)
  const audioUrls = resources.filter((resource) => resource.kind === 'audio').map((resource) => resource.url)
  const firstFrameUrls = resources.filter((resource) => resource.role === 'first_frame').map((resource) => resource.url)
  const lastFrameUrls = resources.filter((resource) => resource.role === 'last_frame').map((resource) => resource.url)

  return {
    ...(imageUrls.length > 0 ? { imageUrls } : {}),
    ...(videoUrls.length > 0 ? { videoUrls } : {}),
    ...(videoCoverUrls.length > 0 ? { videoCoverUrls } : {}),
    ...(audioUrls.length > 0 ? { audioUrls } : {}),
    ...(firstFrameUrls.length > 0 ? { firstFrameUrls } : {}),
    ...(lastFrameUrls.length > 0 ? { lastFrameUrls } : {}),
  }
}

const sourceMetadataKeyByRole: Record<VideoFrameRole, string> = {
  first_frame: 'sourceFirstFrameVideoResourceId',
  last_frame: 'sourceLastFrameVideoResourceId',
  video_cover: 'sourceVideoResourceId',
}

const hasFrameForVideo = (
  resources: NodeOutputResource[],
  video: NodeOutputResource,
  role: VideoFrameRole,
  videoCount: number,
): boolean =>
  resources.some((resource) => {
    if (resource.role !== role) {
      return false
    }
    if (
      resource.metadata?.[sourceMetadataKeyByRole[role]] === video.id ||
      resource.metadata?.sourceVideoResourceId === video.id
    ) {
      return true
    }
    return videoCount === 1 && resource.metadata?.sourceVideoResourceId === undefined
  })

const frameRolesForVideoOutput = (): VideoFrameRole[] => ['first_frame', 'last_frame', 'video_cover']

export class OutputPostProcessor {
  constructor(private readonly videoFrameGenerator: VideoFrameGenerator) {}

  async process(task: Task, output: NodeExecutionOutput): Promise<NodeExecutionOutput> {
    if (task.kind !== 'video_generation') {
      return {
        ...output,
        variables: {
          ...buildOutputVariables(output.resources),
          ...output.variables,
        },
      }
    }

    const resources = [...output.resources]
    const videos = resources.filter((resource) => resource.role === 'generated_video' && resource.kind === 'video')
    const frameRoles = frameRolesForVideoOutput()
    for (const video of videos) {
      for (const frameRole of frameRoles) {
        if (hasFrameForVideo(resources, video, frameRole, videos.length)) {
          continue
        }
        resources.push(
          await this.videoFrameGenerator.generateFrame({
            accountId: task.accountId,
            frameRole,
            taskId: task.id,
            video,
          }),
        )
      }
    }

    return {
      resources,
      variables: {
        ...output.variables,
        ...buildOutputVariables(resources),
      },
    }
  }
}
