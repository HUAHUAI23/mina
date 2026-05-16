import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { NodeOutputResource } from '@mina/contracts/modules/tasks'

import type { MediaObjectService } from '../../media/media-object.service'

export interface VideoCoverGeneratorInput {
  accountId: string
  taskId: string
  video: NodeOutputResource
}

export interface VideoCoverGenerator {
  generateCover(input: VideoCoverGeneratorInput): Promise<NodeOutputResource>
}

export class DeterministicVideoCoverGenerator implements VideoCoverGenerator {
  constructor(private readonly mediaObjectService?: MediaObjectService) {}

  async generateCover(input: VideoCoverGeneratorInput): Promise<NodeOutputResource> {
    if (this.mediaObjectService) {
      const mediaObject = await this.mediaObjectService.createFromBuffer({
        accountId: input.accountId,
        body: new TextEncoder().encode(`${input.taskId}:${input.video.id}:cover`),
        kind: 'image',
        mimeType: 'image/jpeg',
        metadata: {
          frameTimeSeconds: 0,
          parentMediaObjectId: input.video.mediaObjectId,
          sourceVideoResourceId: input.video.id,
        },
        objectNameKind: 'cover',
        origin: 'system_generated',
        ...(input.video.mediaObjectId ? { parentMediaObjectId: input.video.mediaObjectId } : {}),
        purpose: 'preview',
        retention: 'task_scoped',
        sourceTaskId: input.taskId,
      })
      return {
        id: `${input.taskId}:video-cover:${input.video.index}`,
        kind: 'image',
        role: 'video_cover',
        index: input.video.index + 1,
        url: mediaObject.url,
        mediaObjectId: mediaObject.id,
        metadata: {
          frameTimeSeconds: 0,
          parentMediaObjectId: input.video.mediaObjectId,
          sourceVideoResourceId: input.video.id,
        },
      }
    }
    return {
      id: `${input.taskId}:video-cover:${input.video.index}`,
      kind: 'image',
      role: 'video_cover',
      index: input.video.index + 1,
      url: `${input.video.url}#cover`,
      metadata: {
        frameTimeSeconds: 0,
        sourceVideoResourceId: input.video.id,
      },
    }
  }
}

export class FfmpegVideoCoverGenerator implements VideoCoverGenerator {
  constructor(private readonly mediaObjectService: MediaObjectService) {}

  async generateCover(input: VideoCoverGeneratorInput): Promise<NodeOutputResource> {
    if (!/^https?:\/\//.test(input.video.url)) {
      return new DeterministicVideoCoverGenerator(this.mediaObjectService).generateCover(input)
    }

    const tempDir = await mkdtemp(join(tmpdir(), 'mina-video-cover-'))
    const videoPath = join(tempDir, 'input-video')
    const coverPath = join(tempDir, 'cover.jpg')

    try {
      const response = await fetch(input.video.url)
      if (!response.ok) {
        throw new Error(`Video download failed with HTTP ${response.status}.`)
      }
      const body = new Uint8Array(await response.arrayBuffer())
      await writeFile(videoPath, body)
      await runFfmpeg([
        '-y',
        '-i',
        videoPath,
        '-frames:v',
        '1',
        '-q:v',
        '2',
        coverPath,
      ])
      const cover = await readFile(coverPath)
      const mediaObject = await this.mediaObjectService.createFromBuffer({
        accountId: input.accountId,
        body: cover,
        kind: 'image',
        mimeType: 'image/jpeg',
        metadata: {
          frameTimeSeconds: 0,
          parentMediaObjectId: input.video.mediaObjectId,
          sourceVideoResourceId: input.video.id,
        },
        objectNameKind: 'cover',
        origin: 'system_generated',
        ...(input.video.mediaObjectId ? { parentMediaObjectId: input.video.mediaObjectId } : {}),
        purpose: 'preview',
        retention: 'task_scoped',
        sourceTaskId: input.taskId,
      })

      return {
        id: `${input.taskId}:video-cover:${input.video.index}`,
        kind: 'image',
        role: 'video_cover',
        index: input.video.index + 1,
        url: mediaObject.url,
        mediaObjectId: mediaObject.id,
        metadata: {
          frameTimeSeconds: 0,
          parentMediaObjectId: input.video.mediaObjectId,
          sourceVideoResourceId: input.video.id,
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
