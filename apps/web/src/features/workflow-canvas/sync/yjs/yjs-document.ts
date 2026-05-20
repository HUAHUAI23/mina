import * as Y from 'yjs'
import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

export interface WorkflowYDocHandles {
  edgeOrder: Y.Array<string>
  edges: Y.Map<unknown>
  meta: Y.Map<unknown>
  nodeOrder: Y.Array<string>
  nodes: Y.Map<unknown>
  ydoc: Y.Doc
}

export interface WorkflowYSnapshot {
  edges: WorkflowCanvasEdge[]
  nodes: WorkflowCanvasNode[]
}

export const createWorkflowYDoc = (): WorkflowYDocHandles => {
  const ydoc = new Y.Doc()
  return {
    edgeOrder: ydoc.getArray<string>('edgeOrder'),
    edges: ydoc.getMap<unknown>('edges'),
    meta: ydoc.getMap<unknown>('meta'),
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

export const importWorkflowSnapshotToYjs = (
  y: WorkflowYDocHandles,
  snapshot: WorkflowYSnapshot,
  origin = 'mina-import',
): void => {
  y.ydoc.transact(() => {
    y.nodes.clear()
    for (const node of snapshot.nodes) {
      y.nodes.set(node.id, node)
    }
    replaceYArray(y.nodeOrder, unique(snapshot.nodes.map((node) => node.id)))

    y.edges.clear()
    for (const edge of snapshot.edges) {
      y.edges.set(edge.id, edge)
    }
    replaceYArray(y.edgeOrder, unique(snapshot.edges.map((edge) => edge.id)))
  }, origin)
}

export const exportWorkflowSnapshotFromYjs = (y: WorkflowYDocHandles): WorkflowYSnapshot => {
  const nodes = unique(y.nodeOrder.toArray())
    .map((nodeId) => y.nodes.get(nodeId))
    .filter((node): node is WorkflowCanvasNode => Boolean(node))
  const edges = unique(y.edgeOrder.toArray())
    .map((edgeId) => y.edges.get(edgeId))
    .filter((edge): edge is WorkflowCanvasEdge => Boolean(edge))
  return { edges, nodes }
}

export const workflowYjsSnapshotMatches = (
  left: WorkflowYSnapshot,
  right: WorkflowYSnapshot,
): boolean =>
  JSON.stringify({ edges: left.edges, nodes: left.nodes }) ===
  JSON.stringify({ edges: right.edges, nodes: right.nodes })
