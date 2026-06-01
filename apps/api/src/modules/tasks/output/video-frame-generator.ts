import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { NodeOutputResource, ResourceRole } from '@mina/contracts/modules/tasks'

import type { MediaObjectService } from '../../media/media-object.service'

export type VideoFrameRole = Extract<ResourceRole, 'first_frame' | 'last_frame' | 'video_cover'>

export interface VideoFrameGeneratorInput {
  accountId: string
  frameRole: VideoFrameRole
  taskId: string
  video: NodeOutputResource
}

export interface VideoFrameGenerator {
  generateFrame(input: VideoFrameGeneratorInput): Promise<NodeOutputResource>
}

type VideoFrameDerivativeStatus = 'generated' | 'fallback'
type VideoFrameFallbackReason = 'video_url_missing' | 'video_read_url_failed' | 'ffmpeg_failed'

const frameMetadataKey = (role: VideoFrameRole): string => {
  if (role === 'first_frame') return 'sourceFirstFrameVideoResourceId'
  if (role === 'last_frame') return 'sourceLastFrameVideoResourceId'
  return 'sourceVideoResourceId'
}

const frameIdSegment = (role: VideoFrameRole): string => role.replaceAll('_', '-')

const frameIndexOffset = (role: VideoFrameRole): number => {
  if (role === 'first_frame') return 1
  if (role === 'last_frame') return 2
  return 3
}

const frameTimeSeconds = (role: VideoFrameRole): number => role === 'last_frame' ? -1 : 0
const fallbackJpeg = Uint8Array.from(Buffer.from(
  '/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYwLjMxLjEwMgD/2wBDAAgEBAQEBAUFBQUFBQYGBgYGBgYGBgYGBgYHBwcICAgHBwcGBgcHCAgICAkJCQgICAgJCQoKCgwMCwsODg4RERT/xABLAAEBAAAAAAAAAAAAAAAAAAAACAEBAAAAAAAAAAAAAAAAAAAAABABAAAAAAAAAAAAAAAAAAAAABEBAAAAAAAAAAAAAAAAAAAAAP/AABEIAAIAAgMBIgACEQADEQD/2gAMAwEAAhEDEQA/AJ/AB//Z',
  'base64',
))

const frameMetadata = (
  input: VideoFrameGeneratorInput,
  status: VideoFrameDerivativeStatus,
  fallbackReason?: VideoFrameFallbackReason,
): Record<string, unknown> => {
  const sourceKey = frameMetadataKey(input.frameRole)
  return {
    derivativeStatus: status,
    frameRole: input.frameRole,
    frameTimeSeconds: frameTimeSeconds(input.frameRole),
    parentMediaObjectId: input.video.mediaObjectId,
    ...(fallbackReason ? { fallbackReason } : {}),
    [sourceKey]: input.video.id,
  }
}

const frameResource = (
  input: VideoFrameGeneratorInput,
  media: { id?: string; url: string },
  metadata: Record<string, unknown>,
): NodeOutputResource => ({
  id: `${input.taskId}:${frameIdSegment(input.frameRole)}:${input.video.index}`,
  kind: 'image',
  role: input.frameRole,
  index: input.video.index + frameIndexOffset(input.frameRole),
  url: media.url,
  ...(media.id ? { mediaObjectId: media.id } : {}),
  metadata,
})

const createFallbackCover = async (
  mediaObjectService: MediaObjectService,
  input: VideoFrameGeneratorInput,
  fallbackReason: VideoFrameFallbackReason,
): Promise<NodeOutputResource> => {
  if (input.frameRole !== 'video_cover') {
    return Promise.reject(new Error(`Unable to extract required ${input.frameRole} from generated video.`))
  }
  const metadata = frameMetadata(input, 'fallback', fallbackReason)
  const mediaObject = await mediaObjectService.createFromBuffer({
    accountId: input.accountId,
    body: fallbackJpeg,
    kind: 'image',
    mimeType: 'image/jpeg',
    metadata,
    objectNameKind: input.frameRole,
    origin: 'system_generated',
    ...(input.video.mediaObjectId ? { parentMediaObjectId: input.video.mediaObjectId } : {}),
    purpose: 'preview',
    retention: 'task_scoped',
    sourceTaskId: input.taskId,
  })
  return frameResource(input, mediaObject, metadata)
}

const resolveFinalizedVideoUrl = async (
  mediaObjectService: MediaObjectService,
  input: VideoFrameGeneratorInput,
): Promise<{ reason?: VideoFrameFallbackReason; url?: string }> => {
  if (!input.video.mediaObjectId) {
    return { reason: 'video_url_missing' }
  }
  try {
    return { url: await mediaObjectService.createReadUrl(input.accountId, input.video.mediaObjectId) }
  } catch {
    return { reason: 'video_read_url_failed' }
  }
}

export class DeterministicVideoFrameGenerator implements VideoFrameGenerator {
  constructor(private readonly mediaObjectService?: MediaObjectService) {}

  async generateFrame(input: VideoFrameGeneratorInput): Promise<NodeOutputResource> {
    const metadata = frameMetadata(input, 'fallback', 'ffmpeg_failed')
    if (this.mediaObjectService) {
      const mediaObject = await this.mediaObjectService.createFromBuffer({
        accountId: input.accountId,
        body: fallbackJpeg,
        kind: 'image',
        mimeType: 'image/jpeg',
        metadata,
        objectNameKind: input.frameRole,
        origin: 'system_generated',
        ...(input.video.mediaObjectId ? { parentMediaObjectId: input.video.mediaObjectId } : {}),
        purpose: 'preview',
        retention: 'task_scoped',
        sourceTaskId: input.taskId,
      })
      return frameResource(input, mediaObject, metadata)
    }
    return frameResource(input, { url: `${input.video.url}#${input.frameRole}` }, metadata)
  }
}

export class FfmpegVideoFrameGenerator implements VideoFrameGenerator {
  constructor(private readonly mediaObjectService: MediaObjectService) {}

  async generateFrame(input: VideoFrameGeneratorInput): Promise<NodeOutputResource> {
    const resolved = await resolveFinalizedVideoUrl(this.mediaObjectService, input)
    if (!resolved.url) {
      return createFallbackCover(this.mediaObjectService, input, resolved.reason ?? 'video_url_missing')
    }

    const tempDir = await mkdtemp(join(tmpdir(), 'mina-video-frame-'))
    const videoPath = join(tempDir, 'input-video')
    const framePath = join(tempDir, 'frame.jpg')

    try {
      const response = await fetch(resolved.url)
      if (!response.ok) {
        throw new Error(`Video download failed with HTTP ${response.status}.`)
      }
      const body = new Uint8Array(await response.arrayBuffer())
      await writeFile(videoPath, body)
      const seekArgs = input.frameRole === 'last_frame' ? ['-sseof', '-0.1'] : []
      await runFfmpeg(['-y', ...seekArgs, '-i', videoPath, '-frames:v', '1', '-q:v', '2', framePath])
      const frame = await readFile(framePath)
      const metadata = frameMetadata(input, 'generated')
      const mediaObject = await this.mediaObjectService.createFromBuffer({
        accountId: input.accountId,
        body: frame,
        kind: 'image',
        mimeType: 'image/jpeg',
        metadata,
        objectNameKind: input.frameRole,
        origin: 'system_generated',
        ...(input.video.mediaObjectId ? { parentMediaObjectId: input.video.mediaObjectId } : {}),
        purpose: 'preview',
        retention: 'task_scoped',
        sourceTaskId: input.taskId,
      })

      return frameResource(input, mediaObject, metadata)
    } catch {
      return createFallbackCover(this.mediaObjectService, input, 'ffmpeg_failed')
    } finally {
      await rm(tempDir, { force: true, recursive: true })
    }
  }
}

const runFfmpeg = (args: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`ffmpeg failed with exit code ${code}: ${stderr.trim()}`))
    })
  })
