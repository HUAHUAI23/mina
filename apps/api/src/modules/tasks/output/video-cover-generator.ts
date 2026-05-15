import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { NodeOutputResource } from '@mina/contracts/modules/tasks'

import type { ObjectStorage } from '../../../lib/storage/object-storage'

export interface VideoCoverGeneratorInput {
  accountId: string
  taskId: string
  video: NodeOutputResource
}

export interface VideoCoverGenerator {
  generateCover(input: VideoCoverGeneratorInput): Promise<NodeOutputResource>
}

export class DeterministicVideoCoverGenerator implements VideoCoverGenerator {
  async generateCover(input: VideoCoverGeneratorInput): Promise<NodeOutputResource> {
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
  constructor(private readonly storage: ObjectStorage) {}

  async generateCover(input: VideoCoverGeneratorInput): Promise<NodeOutputResource> {
    if (!/^https?:\/\//.test(input.video.url)) {
      return new DeterministicVideoCoverGenerator().generateCover(input)
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
      const stored = await this.storage.putObject({
        accountId: input.accountId,
        body: cover,
        contentType: 'image/jpeg',
        objectName: `${input.taskId}/video-cover-${input.video.index}.jpg`,
        scope: 'task-outputs',
      })

      return {
        id: `${input.taskId}:video-cover:${input.video.index}`,
        kind: 'image',
        role: 'video_cover',
        index: input.video.index + 1,
        url: stored.url,
        metadata: {
          frameTimeSeconds: 0,
          sourceStorageKey: stored.key,
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
