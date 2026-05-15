import type { NodeExecutionOutput, NodeOutputResource, Task } from '@mina/contracts/modules/tasks'

import type { VideoCoverGenerator } from './video-cover-generator'

export const buildOutputVariables = (resources: NodeOutputResource[]): NodeExecutionOutput['variables'] => {
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

const hasCoverForVideo = (resources: NodeOutputResource[], video: NodeOutputResource): boolean =>
  resources.some(
    (resource) =>
      resource.role === 'video_cover' &&
      (resource.metadata?.sourceVideoResourceId === video.id ||
        (resource.metadata?.sourceVideoResourceId === undefined && resource.index === video.index + 1)),
  )

export class OutputPostProcessor {
  constructor(private readonly videoCoverGenerator: VideoCoverGenerator) {}

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
    for (const video of videos) {
      if (hasCoverForVideo(resources, video)) {
        continue
      }
      resources.push(
        await this.videoCoverGenerator.generateCover({
          accountId: task.accountId,
          taskId: task.id,
          video,
        }),
      )
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
