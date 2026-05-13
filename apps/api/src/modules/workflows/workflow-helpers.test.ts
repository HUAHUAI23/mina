import { describe, expect, test } from 'bun:test'
import type {
  MediaInput,
  MediaSlotConnection,
  NodeExecutionOutput,
  ResourceKind,
  ResourceRole,
  VideoGenerationConfig,
  WorkflowCanvasEdge,
  WorkflowCanvasNode,
} from '@mina/contracts'

import { createInitialNodeStates } from './execution'
import {
  buildVideoTaskConfig,
  collectInputResources,
  findOutputByMediaView,
  slotToInputRole,
  slotToResourceKind,
} from './media'
import { validateFlowGroup } from './validation'

const imageNode = (id: string, parentId?: string): WorkflowCanvasNode => ({
  id,
  type: 'image_generation',
  position: { x: 0, y: 0 },
  ...(parentId ? { parentId, extent: 'parent' as const } : {}),
  data: {
    nodeType: 'image_generation',
    title: id,
    config: {
      task: {
        kind: 'image_generation',
        mode: 'text_to_image',
        provider: 'dev',
        model: 'dev-image',
        prompt: id,
        size: '1024x1024',
        count: 1,
      },
    },
  },
})

const flowGroupNode = (id: string): WorkflowCanvasNode => ({
  id,
  type: 'flow_group',
  position: { x: 0, y: 0 },
  width: 800,
  height: 400,
  data: {
    nodeType: 'flow_group',
    title: id,
    config: {},
  },
})

const mediaEdge = (
  id: string,
  source: string,
  target: string,
  sourceSelector: MediaSlotConnection['sourceSelector'] = { mode: 'current_media' },
): WorkflowCanvasEdge => ({
  id,
  type: 'media',
  source,
  target,
  data: {
    connection: {
      kind: 'media_slot',
      targetSlot: 'inputImages',
      required: true,
      sourceSelector,
    },
  },
})

const mediaInput = (kind: ResourceKind, role: ResourceRole, url: string): MediaInput => ({
  kind,
  role,
  url,
})

describe('workflow helper semantics', () => {
  test('maps media slots to task input roles and resource kinds', () => {
    expect(slotToInputRole('firstFrame')).toBe('first_frame')
    expect(slotToInputRole('lastFrame')).toBe('last_frame')
    expect(slotToInputRole('referenceImages')).toBe('reference_image')
    expect(slotToInputRole('referenceAudios')).toBe('reference_audio')
    expect(slotToInputRole('referenceVideos')).toBe('reference_video')

    expect(slotToResourceKind('firstFrame')).toBe('image')
    expect(slotToResourceKind('referenceAudios')).toBe('audio')
    expect(slotToResourceKind('referenceVideos')).toBe('video')
    expect(slotToResourceKind('prompt')).toBeUndefined()
  })

  test('selects MediaView output by id first, then index, then default output', () => {
    const output: NodeExecutionOutput = {
      resources: [
        { id: 'out-0', kind: 'image', role: 'generated_image', index: 0, url: 'https://cdn.test/0.png' },
        { id: 'out-1', kind: 'image', role: 'generated_image', index: 1, url: 'https://cdn.test/1.png' },
      ],
      variables: {},
    }

    expect(findOutputByMediaView(output, 'out-1', 0)?.id).toBe('out-1')
    expect(findOutputByMediaView(output, undefined, 1)?.id).toBe('out-1')
    expect(findOutputByMediaView(output, undefined, undefined)?.id).toBe('out-0')
  })

  test('builds video configs with first frame, tail frame, reference audio, and reference video inputs', () => {
    const baseConfig: VideoGenerationConfig = {
      kind: 'video_generation',
      provider: 'dev',
      model: 'dev-video',
      prompt: 'video',
      resolution: '1080p',
      durationSeconds: 5,
      referenceImages: [mediaInput('image', 'reference_image', 'https://cdn.test/base.png')],
      referenceAudios: [],
      referenceVideos: [],
      outputLastFrame: true,
    }

    const firstFrame = mediaInput('image', 'first_frame', 'https://cdn.test/first.png')
    const lastFrame = mediaInput('image', 'last_frame', 'https://cdn.test/last.png')
    const referenceAudio = mediaInput('audio', 'reference_audio', 'https://cdn.test/ref.mp3')
    const referenceVideo = mediaInput('video', 'reference_video', 'https://cdn.test/ref.mp4')

    const config = buildVideoTaskConfig(baseConfig, {
      firstFrame: [firstFrame],
      lastFrame: [lastFrame],
      referenceAudios: [referenceAudio],
      referenceVideos: [referenceVideo],
    })

    expect(config.firstFrame).toEqual(firstFrame)
    expect(config.lastFrame).toEqual(lastFrame)
    expect(config.referenceImages).toHaveLength(1)
    expect(config.referenceAudios).toEqual([referenceAudio])
    expect(config.referenceVideos).toEqual([referenceVideo])
    expect(collectInputResources(config).map((input) => input.role)).toEqual([
      'first_frame',
      'last_frame',
      'reference_image',
      'reference_audio',
      'reference_video',
    ])
  })

  test('initial flow-group node states include executable descendants only', () => {
    const nodes = [flowGroupNode('group'), imageNode('a', 'group'), imageNode('b'), flowGroupNode('nested')]
    const states = createInitialNodeStates(nodes, 'a', 'group')

    expect(Object.keys(states)).toEqual(['a'])
    expect(states.a?.status).toBe('pending')
  })

  test('flow group validation rejects cross-scope edges', () => {
    const nodes = [flowGroupNode('group'), imageNode('a', 'group'), imageNode('b')]

    expect(() => validateFlowGroup(nodes, [mediaEdge('a-b', 'a', 'b')], 'group')).toThrow(
      'Flow group execution does not support cross-scope edges.',
    )
  })

  test('flow group validation rejects executable cycles', () => {
    const nodes = [flowGroupNode('group'), imageNode('a', 'group'), imageNode('b', 'group')]
    const edges = [mediaEdge('a-b', 'a', 'b'), mediaEdge('b-a', 'b', 'a')]

    expect(() => validateFlowGroup(nodes, edges, 'group')).toThrow('Flow group execution graph must be acyclic.')
  })
})
