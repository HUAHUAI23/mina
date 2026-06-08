import type {
  WorkflowNodeData,
  WorkflowCanvasNode,
  WorkflowNodeType,
} from '@mina/contracts/modules/canvas'
import type { TaskDraftConfig } from '@mina/contracts/modules/tasks'

type CanvasNodeWithData<TNodeType extends WorkflowNodeType> = Omit<
  WorkflowCanvasNode,
  'data' | 'type'
> & {
  data: Extract<WorkflowNodeData, { nodeType: TNodeType }>
  type: TNodeType
}

export type ImageGenerationCanvasNode = CanvasNodeWithData<'image_generation'>

export type VideoGenerationCanvasNode = CanvasNodeWithData<'video_generation'>

export type MediaGenerationCanvasNode =
  | ImageGenerationCanvasNode
  | VideoGenerationCanvasNode

export type TextCanvasNode = CanvasNodeWithData<'text'>

export type FlowGroupCanvasNode = CanvasNodeWithData<'flow_group'>

export type NodeGroupCanvasNode = CanvasNodeWithData<'node_group'>

export const isMediaGenerationNode = (
  node: WorkflowCanvasNode | undefined,
): node is MediaGenerationCanvasNode =>
  node?.data.nodeType === 'image_generation' ||
  node?.data.nodeType === 'video_generation'

export const isImageGenerationNode = (
  node: WorkflowCanvasNode | undefined,
): node is ImageGenerationCanvasNode => node?.data.nodeType === 'image_generation'

export const isVideoGenerationNode = (
  node: WorkflowCanvasNode | undefined,
): node is VideoGenerationCanvasNode => node?.data.nodeType === 'video_generation'

export const isGroupNodeType = (type: WorkflowNodeType): boolean =>
  type === 'flow_group' || type === 'node_group'

export const defaultTaskForNodeType = (
  type: Extract<WorkflowNodeType, 'image_generation' | 'video_generation'>,
): TaskDraftConfig =>
  type === 'image_generation'
    ? {
        kind: 'image_generation',
        provider: 'google',
        model: 'gemini-3.1-flash-image-preview',
        prompt: 'Describe the image',
        params: {
          aspectRatio: '1:1',
          count: 1,
          imageSearch: false,
          imageSize: '1K',
          includeThoughts: false,
          webSearch: false,
        },
      }
    : {
        kind: 'video_generation',
        provider: 'google',
        model: 'veo-3.1-generate-preview',
        prompt: 'Describe the motion',
        params: {
          aspectRatio: '16:9',
          durationSeconds: 8,
          personGeneration: 'allow_all',
          resolution: '720p',
        },
      }

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`

export const MEDIA_GENERATION_NODE_FRAME = {
  height: 292,
  width: 390,
} as const

export const createWorkflowCanvasNode = (
  type: WorkflowNodeType,
  index: number,
  taskOverride?: TaskDraftConfig | undefined,
): WorkflowCanvasNode => {
  const position = {
    x: 120 + (index % 4) * 280,
    y: 120 + Math.floor(index / 4) * 220,
  }

  if (type === 'image_generation') {
    return {
      id: createId('node'),
      type,
      position,
      width: MEDIA_GENERATION_NODE_FRAME.width,
      data: {
        nodeType: type,
        title: 'Image Node',
        config: { task: taskOverride ?? defaultTaskForNodeType(type) },
        mediaSlots: {},
      },
    }
  }

  if (type === 'video_generation') {
    return {
      id: createId('node'),
      type,
      position,
      width: MEDIA_GENERATION_NODE_FRAME.width,
      data: {
        nodeType: type,
        title: 'Video Node',
        config: { task: taskOverride ?? defaultTaskForNodeType(type) },
        mediaSlots: {},
      },
    }
  }

  if (type === 'flow_group') {
    return {
      id: createId('group'),
      type,
      position,
      width: 560,
      height: 340,
      data: { nodeType: type, title: 'Flow Group', config: {} },
    }
  }

  if (type === 'node_group') {
    return {
      id: createId('group'),
      type,
      position,
      width: 520,
      height: 300,
      data: { nodeType: type, title: 'Node Group', config: {} },
    }
  }

  return {
    id: createId('note'),
    type,
    position,
    width: 220,
    data: { nodeType: type, title: 'Text', config: { text: '' } },
  }
}
