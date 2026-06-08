import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import type {
  FlowGroupFlowNode,
  ImageGenerationFlowNode,
  NodeGroupFlowNode,
  TextFlowNode,
  VideoGenerationFlowNode,
  WorkflowFlowEdge,
  WorkflowFlowNode,
} from '../domain/flow-types'
import { MEDIA_GENERATION_NODE_FRAME } from '../domain/canvas-node-types'

const flowNodeDimensions = (node: WorkflowCanvasNode) => {
  if (node.data.nodeType === 'image_generation' || node.data.nodeType === 'video_generation') {
    return {
      height: MEDIA_GENERATION_NODE_FRAME.height,
      width: MEDIA_GENERATION_NODE_FRAME.width,
    }
  }
  return {
    ...(node.width !== undefined ? { width: node.width } : {}),
    ...(node.height !== undefined ? { height: node.height } : {}),
  }
}

const flowNodeFrame = (node: WorkflowCanvasNode) => {
  const isGroupNode = node.data.nodeType === 'flow_group' || node.data.nodeType === 'node_group'
  return {
    id: node.id,
    position: node.position,
    ...(node.parentId ? { parentId: node.parentId } : {}),
    ...(node.parentId ? { extent: 'parent' as const, expandParent: true } : {}),
    ...(isGroupNode ? { dragHandle: '.workflow-group-drag-handle' } : {}),
    ...flowNodeDimensions(node),
  }
}

export const toFlowNode = (node: WorkflowCanvasNode): WorkflowFlowNode => {
  if (node.data.nodeType === 'image_generation') {
    return {
      ...flowNodeFrame(node),
      type: 'image_generation',
      data: {
        mediaView: node.data.mediaView,
        nodeId: node.id,
        nodeType: 'image_generation',
        title: node.data.title,
      },
    } satisfies ImageGenerationFlowNode
  }
  if (node.data.nodeType === 'video_generation') {
    return {
      ...flowNodeFrame(node),
      type: 'video_generation',
      data: {
        mediaView: node.data.mediaView,
        nodeId: node.id,
        nodeType: 'video_generation',
        title: node.data.title,
      },
    } satisfies VideoGenerationFlowNode
  }
  if (node.data.nodeType === 'flow_group') {
    return {
      ...flowNodeFrame(node),
      type: 'flow_group',
      data: {
        nodeId: node.id,
        nodeType: 'flow_group',
        title: node.data.title,
      },
    } satisfies FlowGroupFlowNode
  }
  if (node.data.nodeType === 'node_group') {
    return {
      ...flowNodeFrame(node),
      type: 'node_group',
      data: {
        nodeId: node.id,
        nodeType: 'node_group',
        title: node.data.title,
      },
    } satisfies NodeGroupFlowNode
  }
  return {
    ...flowNodeFrame(node),
    type: 'text',
    data: {
      nodeId: node.id,
      nodeType: 'text',
      textPreview: node.data.config.text,
      title: node.data.title,
    },
  } satisfies TextFlowNode
}

export const toFlowEdge = (edge: WorkflowCanvasEdge): WorkflowFlowEdge => ({
  id: edge.id,
  type: 'media',
  source: edge.source,
  target: edge.target,
  sourceHandle: edge.sourceHandle ?? null,
  targetHandle: edge.targetHandle ?? null,
  data: edge.data,
})

export const fromFlowEdge = (
  edge: WorkflowFlowEdge,
  existing: WorkflowCanvasEdge,
): WorkflowCanvasEdge => ({
  ...existing,
  source: edge.source,
  target: edge.target,
  ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
  ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
})

export const fromFlowNodeFrame = (
  node: WorkflowFlowNode,
  existing: WorkflowCanvasNode,
): WorkflowCanvasNode => {
  const { extent: _extent, parentId: _parentId, ...base } = existing
  return {
    ...base,
    position: node.position,
    ...(node.parentId ? { parentId: node.parentId, extent: 'parent' as const } : {}),
    ...((existing.type === 'flow_group' || existing.type === 'node_group' || existing.type === 'text') &&
    node.measured?.width
      ? { width: node.measured.width }
      : existing.width !== undefined
        ? { width: existing.width }
        : {}),
    ...((existing.type === 'flow_group' || existing.type === 'node_group' || existing.type === 'text') &&
    node.measured?.height
      ? { height: node.measured.height }
      : existing.height !== undefined
        ? { height: existing.height }
        : {}),
  }
}

export const hasPersistedNodeFrameChanged = (
  left: WorkflowCanvasNode,
  right: WorkflowCanvasNode,
): boolean =>
  left.position.x !== right.position.x ||
  left.position.y !== right.position.y ||
  left.parentId !== right.parentId ||
  left.extent !== right.extent ||
  left.width !== right.width ||
  left.height !== right.height
