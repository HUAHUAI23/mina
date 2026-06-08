import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import {
  writeWorkflowNode,
  type WorkflowYDocHandles,
} from './yjs-document'

export const replaceNodeOrder = (y: WorkflowYDocHandles, nodes: readonly WorkflowCanvasNode[]): void => {
  if (y.nodeOrder.length > 0) {
    y.nodeOrder.delete(0, y.nodeOrder.length)
  }
  if (nodes.length > 0) {
    y.nodeOrder.push(nodes.map((node) => node.id))
  }
}

export const writeNodeFrame = (y: WorkflowYDocHandles, node: WorkflowCanvasNode): void => {
  const currentFrame = y.nodeFrames.get(node.id) as Partial<WorkflowCanvasNode> | undefined
  const nextFrame: Partial<WorkflowCanvasNode> = {
    ...(currentFrame ?? {}),
    position: node.position,
    ...(node.width !== undefined ? { width: node.width } : {}),
    ...(node.height !== undefined ? { height: node.height } : {}),
  }
  if (node.parentId) {
    nextFrame.parentId = node.parentId
    nextFrame.extent = 'parent'
  } else {
    delete nextFrame.parentId
    delete nextFrame.extent
  }
  y.nodeFrames.set(node.id, nextFrame)
}

export const upsertNode = (y: WorkflowYDocHandles, node: WorkflowCanvasNode): void => {
  writeWorkflowNode(y.nodes, node)
  writeNodeFrame(y, node)
  if (!y.nodeOrder.toArray().includes(node.id)) {
    y.nodeOrder.push([node.id])
  }
}

export const updateNode = (y: WorkflowYDocHandles, node: WorkflowCanvasNode): void => {
  if (!y.nodes.has(node.id)) {
    return
  }
  writeWorkflowNode(y.nodes, node)
}

export const upsertEdge = (y: WorkflowYDocHandles, edge: WorkflowCanvasEdge): void => {
  y.edges.set(edge.id, structuredClone(edge))
  if (!y.edgeOrder.toArray().includes(edge.id)) {
    y.edgeOrder.push([edge.id])
  }
}

export const deleteEdge = (y: WorkflowYDocHandles, edgeId: string): void => {
  y.edges.delete(edgeId)
  const index = y.edgeOrder.toArray().indexOf(edgeId)
  if (index >= 0) {
    y.edgeOrder.delete(index, 1)
  }
}

export const deleteNode = (y: WorkflowYDocHandles, nodeId: string): void => {
  y.nodes.delete(nodeId)
  y.nodeFrames.delete(nodeId)
  const index = y.nodeOrder.toArray().indexOf(nodeId)
  if (index >= 0) {
    y.nodeOrder.delete(index, 1)
  }
}
