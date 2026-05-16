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

export class DeterministicVideoFrameGenerator implements VideoFrameGenerator {
  constructor(private readonly mediaObjectService?: MediaObjectService) {}

  async generateFrame(input: VideoFrameGeneratorInput): Promise<NodeOutputResource> {
    const sourceKey = frameMetadataKey(input.frameRole)
    if (this.mediaObjectService) {
      const mediaObject = await this.mediaObjectService.createFromBuffer({
        accountId: input.accountId,
        body: new TextEncoder().encode(`${input.taskId}:${input.video.id}:${input.frameRole}`),
        kind: 'image',
        mimeType: 'image/jpeg',
        metadata: {
          frameRole: input.frameRole,
          frameTimeSeconds: frameTimeSeconds(input.frameRole),
          parentMediaObjectId: input.video.mediaObjectId,
          [sourceKey]: input.video.id,
        },
        objectNameKind: input.frameRole,
        origin: 'system_generated',
        ...(input.video.mediaObjectId ? { parentMediaObjectId: input.video.mediaObjectId } : {}),
        purpose: 'preview',
        retention: 'task_scoped',
        sourceTaskId: input.taskId,
      })
      return {
        id: `${input.taskId}:${frameIdSegment(input.frameRole)}:${input.video.index}`,
        kind: 'image',
        role: input.frameRole,
        index: input.video.index + frameIndexOffset(input.frameRole),
        url: mediaObject.url,
        mediaObjectId: mediaObject.id,
        metadata: {
          frameRole: input.frameRole,
          frameTimeSeconds: frameTimeSeconds(input.frameRole),
          parentMediaObjectId: input.video.mediaObjectId,
          [sourceKey]: input.video.id,
        },
      }
    }
    return {
      id: `${input.taskId}:${frameIdSegment(input.frameRole)}:${input.video.index}`,
      kind: 'image',
      role: input.frameRole,
      index: input.video.index + frameIndexOffset(input.frameRole),
      url: `${input.video.url}#${input.frameRole}`,
      metadata: {
        frameRole: input.frameRole,
        frameTimeSeconds: frameTimeSeconds(input.frameRole),
        [sourceKey]: input.video.id,
      },
    }
  }
}

export class FfmpegVideoFrameGenerator implements VideoFrameGenerator {
  constructor(private readonly mediaObjectService: MediaObjectService) {}

  async generateFrame(input: VideoFrameGeneratorInput): Promise<NodeOutputResource> {
    const sourceKey = frameMetadataKey(input.frameRole)
    if (!/^https?:\/\//.test(input.video.url)) {
      return new DeterministicVideoFrameGenerator(this.mediaObjectService).generateFrame(input)
    }

    const tempDir = await mkdtemp(join(tmpdir(), 'mina-video-frame-'))
    const videoPath = join(tempDir, 'input-video')
    const framePath = join(tempDir, 'frame.jpg')

    try {
      const response = await fetch(input.video.url)
      if (!response.ok) {
        throw new Error(`Video download failed with HTTP ${response.status}.`)
      }
      const body = new Uint8Array(await response.arrayBuffer())
      await writeFile(videoPath, body)
      const seekArgs = input.frameRole === 'last_frame' ? ['-sseof', '-0.1'] : []
      await runFfmpeg(['-y', ...seekArgs, '-i', videoPath, '-frames:v', '1', '-q:v', '2', framePath])
      const frame = await readFile(framePath)
      const mediaObject = await this.mediaObjectService.createFromBuffer({
        accountId: input.accountId,
        body: frame,
        kind: 'image',
        mimeType: 'image/jpeg',
        metadata: {
          frameRole: input.frameRole,
          frameTimeSeconds: frameTimeSeconds(input.frameRole),
          parentMediaObjectId: input.video.mediaObjectId,
          [sourceKey]: input.video.id,
        },
        objectNameKind: input.frameRole,
        origin: 'system_generated',
        ...(input.video.mediaObjectId ? { parentMediaObjectId: input.video.mediaObjectId } : {}),
        purpose: 'preview',
        retention: 'task_scoped',
        sourceTaskId: input.taskId,
      })

      return {
        id: `${input.taskId}:${frameIdSegment(input.frameRole)}:${input.video.index}`,
        kind: 'image',
        role: input.frameRole,
        index: input.video.index + frameIndexOffset(input.frameRole),
        url: mediaObject.url,
        mediaObjectId: mediaObject.id,
        metadata: {
          frameRole: input.frameRole,
          frameTimeSeconds: frameTimeSeconds(input.frameRole),
          parentMediaObjectId: input.video.mediaObjectId,
          [sourceKey]: input.video.id,
        },
      }
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
