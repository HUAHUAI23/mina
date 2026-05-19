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
        provider: 'dev',
        model: 'dev-image',
        prompt: 'Describe the image',
        params: { count: 1, size: '1024x1024' },
      }
    : {
        kind: 'video_generation',
        provider: 'dev',
        model: 'dev-video',
        prompt: 'Describe the motion',
        params: {
          durationSeconds: 5,
          outputLastFrame: false,
          resolution: '720p',
        },
      }

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`

export const createWorkflowCanvasNode = (
  type: WorkflowNodeType,
  index: number,
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
      width: 240,
      data: {
        nodeType: type,
        title: 'Image Node',
        config: { task: defaultTaskForNodeType(type) },
        mediaSlots: {},
      },
    }
  }

  if (type === 'video_generation') {
    return {
      id: createId('node'),
      type,
      position,
      width: 260,
      data: {
        nodeType: type,
        title: 'Video Node',
        config: { task: defaultTaskForNodeType(type) },
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
