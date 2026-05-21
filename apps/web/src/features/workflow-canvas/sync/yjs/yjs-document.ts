import * as Y from 'yjs'
import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

export interface WorkflowYDocHandles {
  edgeOrder: Y.Array<string>
  edges: Y.Map<unknown>
  meta: Y.Map<unknown>
  nodeFrames: Y.Map<unknown>
  nodeOrder: Y.Array<string>
  nodes: Y.Map<unknown>
  ydoc: Y.Doc
}

export interface WorkflowYSnapshot {
  edges: WorkflowCanvasEdge[]
  nodes: WorkflowCanvasNode[]
}

export const workflowYjsSnapshotSignature = (snapshot: WorkflowYSnapshot): string =>
  JSON.stringify({
    edges: snapshot.edges.map((edge) => ({
      data: edge.data,
      id: edge.id,
      source: edge.source,
      sourceHandle: edge.sourceHandle,
      target: edge.target,
      targetHandle: edge.targetHandle,
      type: edge.type ?? 'media',
    })),
    nodes: snapshot.nodes.map((node) => ({
      data: node.data,
      extent: node.extent,
      height: node.height,
      id: node.id,
      parentId: node.parentId,
      position: node.position,
      type: node.type,
      width: node.width,
    })),
  })

export const createWorkflowYDoc = (): WorkflowYDocHandles => {
  const ydoc = new Y.Doc()
  return {
    edgeOrder: ydoc.getArray<string>('edgeOrder'),
    edges: ydoc.getMap<unknown>('edges'),
    meta: ydoc.getMap<unknown>('meta'),
    nodeFrames: ydoc.getMap<unknown>('nodeFrames'),
    nodeOrder: ydoc.getArray<string>('nodeOrder'),
    nodes: ydoc.getMap<unknown>('nodes'),
    ydoc,
  }
}

const replaceYArray = <TValue>(array: Y.Array<TValue>, values: readonly TValue[]): void => {
  if (array.length > 0) {
    array.delete(0, array.length)
  }
  if (values.length > 0) {
    array.insert(0, [...values])
  }
}

const unique = <TValue>(values: readonly TValue[]): TValue[] => Array.from(new Set(values))

type WorkflowYNodeFrame = Pick<WorkflowCanvasNode, 'position'> &
  Partial<Pick<WorkflowCanvasNode, 'extent' | 'height' | 'parentId' | 'width'>>

const nodeFrameFromNode = (node: WorkflowCanvasNode): WorkflowYNodeFrame => ({
  position: node.position,
  ...(node.parentId ? { parentId: node.parentId } : {}),
  ...(node.extent ? { extent: node.extent } : {}),
  ...(node.width !== undefined ? { width: node.width } : {}),
  ...(node.height !== undefined ? { height: node.height } : {}),
})

const applyNodeFrame = (node: WorkflowCanvasNode, frame: unknown): WorkflowCanvasNode => {
  if (!frame || typeof frame !== 'object' || !('position' in frame)) {
    return node
  }
  const typedFrame = frame as WorkflowYNodeFrame
  return {
    ...node,
    position: typedFrame.position,
    ...(typedFrame.parentId ? { parentId: typedFrame.parentId } : {}),
    ...(typedFrame.extent ? { extent: typedFrame.extent } : {}),
    ...(typedFrame.width !== undefined ? { width: typedFrame.width } : {}),
    ...(typedFrame.height !== undefined ? { height: typedFrame.height } : {}),
  }
}

export const importWorkflowSnapshotToYjs = (
  y: WorkflowYDocHandles,
  snapshot: WorkflowYSnapshot,
  origin = 'mina-import',
): void => {
  y.ydoc.transact(() => {
    y.nodes.clear()
    y.nodeFrames.clear()
    for (const node of snapshot.nodes) {
      y.nodes.set(node.id, node)
      y.nodeFrames.set(node.id, nodeFrameFromNode(node))
    }
    replaceYArray(y.nodeOrder, unique(snapshot.nodes.map((node) => node.id)))

    y.edges.clear()
    for (const edge of snapshot.edges) {
      y.edges.set(edge.id, edge)
    }
    replaceYArray(y.edgeOrder, unique(snapshot.edges.map((edge) => edge.id)))
  }, origin)
}

const orderedValues = <TValue>(
  order: Y.Array<string>,
  values: Y.Map<unknown>,
): TValue[] => {
  const seen = new Set<string>()
  const ordered = unique(order.toArray())
    .flatMap((id) => {
      const value = values.get(id)
      if (!value) {
        return []
      }
      seen.add(id)
      return [value as TValue]
    })
  const missingFromOrder = Array.from(values.entries())
    .filter(([id, value]) => !seen.has(id) && Boolean(value))
    .map(([, value]) => value as TValue)
  return [...ordered, ...missingFromOrder]
}

export const exportWorkflowSnapshotFromYjs = (y: WorkflowYDocHandles): WorkflowYSnapshot => {
  const nodes = orderedValues<WorkflowCanvasNode>(y.nodeOrder, y.nodes)
    .map((node) => applyNodeFrame(node, y.nodeFrames.get(node.id)))
  const edges = orderedValues<WorkflowCanvasEdge>(y.edgeOrder, y.edges)
  return { edges, nodes }
}

export const workflowYjsSnapshotMatches = (
  left: WorkflowYSnapshot,
  right: WorkflowYSnapshot,
): boolean =>
  workflowYjsSnapshotSignature(left) === workflowYjsSnapshotSignature(right)
