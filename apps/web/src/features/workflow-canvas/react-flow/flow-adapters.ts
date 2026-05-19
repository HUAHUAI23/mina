import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import type {
  WorkflowFlowEdge,
  WorkflowFlowNode,
  WorkflowNodeRuntime,
} from '../domain/flow-types'

export const toFlowNode = (
  node: WorkflowCanvasNode,
  runtime: WorkflowNodeRuntime,
): WorkflowFlowNode => {
  const flowNode = {
    id: node.id,
    type: node.type,
    position: node.position,
    data: {
      nodeId: node.id,
      nodeType: node.data.nodeType,
      runtime,
    },
    ...(node.parentId ? { parentId: node.parentId } : {}),
    ...(node.extent ? { extent: node.extent } : {}),
    ...(node.width !== undefined ? { width: node.width } : {}),
    ...(node.height !== undefined ? { height: node.height } : {}),
  }

  if (node.data.nodeType === 'image_generation') {
    return { ...flowNode, type: 'image_generation', data: { ...flowNode.data, nodeType: 'image_generation' } }
  }
  if (node.data.nodeType === 'video_generation') {
    return { ...flowNode, type: 'video_generation', data: { ...flowNode.data, nodeType: 'video_generation' } }
  }
  if (node.data.nodeType === 'flow_group') {
    return { ...flowNode, type: 'flow_group', data: { ...flowNode.data, nodeType: 'flow_group' } }
  }
  if (node.data.nodeType === 'node_group') {
    return { ...flowNode, type: 'node_group', data: { ...flowNode.data, nodeType: 'node_group' } }
  }
  return { ...flowNode, type: 'text', data: { ...flowNode.data, nodeType: 'text' } }
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
): WorkflowCanvasNode => ({
  ...existing,
  position: node.position,
  ...(node.parentId ? { parentId: node.parentId } : {}),
  ...((existing.type === 'flow_group' || existing.type === 'node_group') &&
  node.measured?.width
    ? { width: node.measured.width }
    : existing.width !== undefined
      ? { width: existing.width }
      : {}),
  ...((existing.type === 'flow_group' || existing.type === 'node_group') &&
  node.measured?.height
    ? { height: node.measured.height }
    : existing.height !== undefined
      ? { height: existing.height }
      : {}),
})

export const hasPersistedNodeFrameChanged = (
  left: WorkflowCanvasNode,
  right: WorkflowCanvasNode,
): boolean =>
  left.position.x !== right.position.x ||
  left.position.y !== right.position.y ||
  left.parentId !== right.parentId ||
  left.width !== right.width ||
  left.height !== right.height
