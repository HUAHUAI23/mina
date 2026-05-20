import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import * as Y from 'yjs'

export interface WorkflowYDocHandles {
  edgeOrder: Y.Array<string>
  edges: Y.Map<unknown>
  meta: Y.Map<unknown>
  nodeOrder: Y.Array<string>
  nodes: Y.Map<unknown>
  ydoc: Y.Doc
}

export interface WorkflowYjsExportSnapshot {
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

const replaceArray = <T>(array: Y.Array<T>, values: readonly T[]): void => {
  if (array.length > 0) {
    array.delete(0, array.length)
  }
  if (values.length > 0) {
    array.insert(0, [...values])
  }
}

const unique = <T>(values: readonly T[]): T[] => Array.from(new Set(values))

export const importWorkflowSnapshotToYDoc = (
  y: WorkflowYDocHandles,
  snapshot: WorkflowYjsExportSnapshot,
  origin = 'mina-server-import',
): void => {
  y.ydoc.transact(() => {
    y.nodes.clear()
    for (const node of snapshot.nodes) {
      y.nodes.set(node.id, node)
    }
    replaceArray(y.nodeOrder, unique(snapshot.nodes.map((node) => node.id)))

    y.edges.clear()
    for (const edge of snapshot.edges) {
      y.edges.set(edge.id, edge)
    }
    replaceArray(y.edgeOrder, unique(snapshot.edges.map((edge) => edge.id)))
  }, origin)
}

export const exportWorkflowSnapshotFromYDoc = (y: WorkflowYDocHandles): WorkflowYjsExportSnapshot => ({
  edges: unique(y.edgeOrder.toArray())
    .map((edgeId) => y.edges.get(edgeId))
    .filter((edge): edge is WorkflowCanvasEdge => Boolean(edge)),
  nodes: unique(y.nodeOrder.toArray())
    .map((nodeId) => y.nodes.get(nodeId))
    .filter((node): node is WorkflowCanvasNode => Boolean(node)),
})
