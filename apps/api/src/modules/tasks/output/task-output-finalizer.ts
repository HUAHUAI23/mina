import type { NodeExecutionOutput, NodeOutputResource, ResourceKind, Task } from '@mina/contracts/modules/tasks'

import type { MediaObjectService } from '../../media/media-object.service'

const DATA_URL_PATTERN = /^data:([^;,]+)?(;base64)?,(.*)$/s
const DEV_TASK_OUTPUT_PATTERN = /^mina:\/\/tasks\/([^/]+)\/outputs\/(\d+)\.([a-z0-9]+)$/i
const MEDIA_OBJECT_URL_PATTERN = /^mina:\/\/media\/([^/?#]+)$/

const mimeTypeFromExtension = (extension: string, kind: ResourceKind): string | undefined => {
  const normalized = extension.toLowerCase()
  if (normalized === 'jpg' || normalized === 'jpeg') return 'image/jpeg'
  if (normalized === 'png') return 'image/png'
  if (normalized === 'webp') return 'image/webp'
  if (normalized === 'gif') return 'image/gif'
  if (normalized === 'mp4') return 'video/mp4'
  if (normalized === 'webm') return 'video/webm'
  if (normalized === 'mp3') return 'audio/mpeg'
  if (normalized === 'wav') return 'audio/wav'
  if (kind === 'image') return 'image/png'
  if (kind === 'video') return 'video/mp4'
  if (kind === 'audio') return 'audio/mpeg'
  return undefined
}

const transparentPng = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
))

const tinyMp4 = Uint8Array.from(Buffer.from(
  'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAGbW9vdg==',
  'base64',
))

const deterministicBodyForDevOutput = (task: Task, resource: NodeOutputResource): Uint8Array => {
  if (resource.kind === 'image') {
    return transparentPng
  }
  if (resource.kind === 'video') {
    return tinyMp4
  }
  return new TextEncoder().encode(`${task.id}:${resource.id}:${resource.kind}:${resource.index}`)
}

const decodeDataUrl = (url: string): { body: Uint8Array; mimeType?: string } => {
  const match = DATA_URL_PATTERN.exec(url)
  if (!match) {
    throw new Error('Invalid data URL output.')
  }
  const mimeType = match[1] || undefined
  const isBase64 = match[2] === ';base64'
  const raw = match[3] ?? ''
  return {
    body: isBase64 ? Uint8Array.from(Buffer.from(raw, 'base64')) : new TextEncoder().encode(decodeURIComponent(raw)),
    ...(mimeType ? { mimeType } : {}),
  }
}

export class TaskOutputFinalizer {
  constructor(private readonly mediaObjectService: MediaObjectService) {}

  async finalize(task: Task, providerOutput: NodeExecutionOutput): Promise<NodeExecutionOutput> {
    const resources: NodeOutputResource[] = []
    for (const resource of providerOutput.resources) {
      resources.push(await this.finalizeResource(task, resource))
    }
    return {
      ...providerOutput,
      resources,
    }
  }

  private async finalizeResource(task: Task, resource: NodeOutputResource): Promise<NodeOutputResource> {
    if (resource.mediaObjectId) {
      const mediaObject = await this.mediaObjectService.getReadyMediaObject(task.accountId, resource.mediaObjectId)
      return {
        ...resource,
        url: mediaObject.url,
      }
    }

    const existingMediaObjectId = MEDIA_OBJECT_URL_PATTERN.exec(resource.url)?.[1]
    if (existingMediaObjectId) {
      const mediaObject = await this.mediaObjectService.getReadyMediaObject(task.accountId, existingMediaObjectId)
      return {
        ...resource,
        mediaObjectId: mediaObject.id,
        url: mediaObject.url,
      }
    }

    const dataUrl = DATA_URL_PATTERN.exec(resource.url)
    if (dataUrl) {
      const decoded = decodeDataUrl(resource.url)
      const mediaObject = await this.mediaObjectService.createFromBuffer({
        accountId: task.accountId,
        body: decoded.body,
        kind: resource.kind,
        ...(decoded.mimeType ? { mimeType: decoded.mimeType } : {}),
        metadata: {
          ...(resource.metadata ?? {}),
          sourceOutputResourceId: resource.id,
        },
        origin: 'task_output',
        purpose: 'task_output',
        retention: 'task_scoped',
        sourceTaskId: task.id,
      })
      return { ...resource, mediaObjectId: mediaObject.id, url: mediaObject.url }
    }

    const devOutput = DEV_TASK_OUTPUT_PATTERN.exec(resource.url)
    if (devOutput) {
      const mimeType = mimeTypeFromExtension(devOutput[3] ?? '', resource.kind)
      const mediaObject = await this.mediaObjectService.createFromBuffer({
        accountId: task.accountId,
        body: deterministicBodyForDevOutput(task, resource),
        kind: resource.kind,
        ...(mimeType ? { mimeType } : {}),
        metadata: {
          ...(resource.metadata ?? {}),
          sourceOutputResourceId: resource.id,
          sourceProviderUrl: resource.url,
        },
        origin: 'task_output',
        purpose: 'task_output',
        retention: 'task_scoped',
        sourceTaskId: task.id,
      })
      return { ...resource, mediaObjectId: mediaObject.id, url: mediaObject.url }
    }

    if (/^https?:\/\//.test(resource.url)) {
      const mediaObject = await this.mediaObjectService.createFromRemoteUrl({
        accountId: task.accountId,
        kind: resource.kind,
        metadata: {
          ...(resource.metadata ?? {}),
          sourceOutputResourceId: resource.id,
          sourceProviderUrl: resource.url,
        },
        origin: 'task_output',
        purpose: 'task_output',
        retention: 'task_scoped',
        sourceTaskId: task.id,
        url: resource.url,
      })
      return { ...resource, mediaObjectId: mediaObject.id, url: mediaObject.url }
    }

    throw new Error(`Unsupported output URL "${resource.url}".`)
  }
}
