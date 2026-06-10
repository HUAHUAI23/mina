import type { MediaInput, Task, TaskMediaConfig } from '@mina/contracts/modules/tasks'

import type { MediaObjectService } from '../../media/media-object.service'

const MEDIA_ARRAY_FIELDS = ['inputImages', 'referenceImages', 'referenceAudios', 'referenceVideos'] as const
const MEDIA_SINGLE_FIELDS = ['firstFrame', 'lastFrame'] as const

type MediaArrayField = (typeof MEDIA_ARRAY_FIELDS)[number]
type MediaSingleField = (typeof MEDIA_SINGLE_FIELDS)[number]

const mediaObjectIdForInput = (input: MediaInput): string | undefined => {
  if (input.mediaObjectId) {
    return input.mediaObjectId
  }
  if (input.source?.type === 'media_object') {
    return input.source.mediaObjectId
  }
  return undefined
}

const collectMediaInputs = (media: TaskMediaConfig): MediaInput[] => [
  ...MEDIA_ARRAY_FIELDS.flatMap((field) => media[field]),
  ...MEDIA_SINGLE_FIELDS.flatMap((field) => {
    const input = media[field]
    return input ? [input] : []
  }),
]

export class ProviderMediaUrlResolver {
  constructor(
    private readonly mediaObjectService: MediaObjectService,
    private readonly expiresInSeconds: number,
  ) {}

  async resolve(task: Task): Promise<Task> {
    const mediaObjectIds = new Set<string>()
    for (const input of collectMediaInputs(task.config.media)) {
      const mediaObjectId = mediaObjectIdForInput(input)
      if (mediaObjectId) {
        mediaObjectIds.add(mediaObjectId)
        continue
      }
      if (input.url.startsWith('s3://')) {
        throw new Error('Provider media input requires mediaObjectId to create a readable URL.')
      }
    }

    if (mediaObjectIds.size === 0) {
      return task
    }

    const readUrls = new Map(
      await Promise.all(
        [...mediaObjectIds].map(async (mediaObjectId) => [
          mediaObjectId,
          await this.mediaObjectService.createReadUrl(task.accountId, mediaObjectId, {
            expiresInSeconds: this.expiresInSeconds,
          }),
        ] as const),
      ),
    )

    const resolveInput = (input: MediaInput): MediaInput => {
      const mediaObjectId = mediaObjectIdForInput(input)
      if (!mediaObjectId) {
        return input
      }
      const url = readUrls.get(mediaObjectId)
      if (!url) {
        throw new Error(`Provider media input ${mediaObjectId} could not be signed.`)
      }
      return {
        ...input,
        url,
      }
    }

    const resolvedMedia: TaskMediaConfig = {
      inputImages: resolveArrayField(task.config.media, 'inputImages', resolveInput),
      referenceImages: resolveArrayField(task.config.media, 'referenceImages', resolveInput),
      referenceAudios: resolveArrayField(task.config.media, 'referenceAudios', resolveInput),
      referenceVideos: resolveArrayField(task.config.media, 'referenceVideos', resolveInput),
      ...(task.config.media.firstFrame ? { firstFrame: resolveSingleField(task.config.media, 'firstFrame', resolveInput) } : {}),
      ...(task.config.media.lastFrame ? { lastFrame: resolveSingleField(task.config.media, 'lastFrame', resolveInput) } : {}),
    }

    return {
      ...task,
      config: {
        ...task.config,
        media: resolvedMedia,
      },
    }
  }
}

const resolveArrayField = (
  media: TaskMediaConfig,
  field: MediaArrayField,
  resolveInput: (input: MediaInput) => MediaInput,
): MediaInput[] => media[field].map(resolveInput)

const resolveSingleField = (
  media: TaskMediaConfig,
  field: MediaSingleField,
  resolveInput: (input: MediaInput) => MediaInput,
): MediaInput => {
  const input = media[field]
  if (!input) {
    throw new Error(`Missing media input for ${field}.`)
  }
  return resolveInput(input)
}
