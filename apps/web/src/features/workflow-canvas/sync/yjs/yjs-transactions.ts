import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import type { CanvasDocumentTransaction } from '../../store/store-types'
import type { WorkflowYDocHandles } from './yjs-document'

export type WorkflowDocumentTransaction = CanvasDocumentTransaction

export const applyWorkflowTransactionToYjs = (
  y: WorkflowYDocHandles,
  transaction: WorkflowDocumentTransaction,
  origin = 'mina-local',
): void => {
  y.ydoc.transact(() => {
    if (transaction.type === 'replace_snapshot') {
      y.nodes.clear()
      for (const node of transaction.nodes) {
        y.nodes.set(node.id, node)
      }
      y.nodeOrder.delete(0, y.nodeOrder.length)
      y.nodeOrder.insert(0, transaction.nodes.map((node) => node.id))
      y.edges.clear()
      for (const edge of transaction.edges) {
        y.edges.set(edge.id, edge)
      }
      y.edgeOrder.delete(0, y.edgeOrder.length)
      y.edgeOrder.insert(0, transaction.edges.map((edge) => edge.id))
      return
    }

    if (transaction.type === 'move_nodes') {
      for (const change of transaction.changes) {
        const current = y.nodes.get(change.nodeId) as WorkflowCanvasNode | undefined
        if (!current) {
          continue
        }
        y.nodes.set(change.nodeId, {
          ...current,
          ...(change.position ? { position: change.position } : {}),
          ...(change.parentId !== undefined ? { parentId: change.parentId } : {}),
          ...(change.width !== undefined ? { width: change.width } : {}),
          ...(change.height !== undefined ? { height: change.height } : {}),
        })
      }
      return
    }

    if (transaction.type === 'connect_media_slot') {
      y.nodes.set(transaction.node.id, transaction.node)
      if (!y.nodeOrder.toArray().includes(transaction.node.id)) {
        y.nodeOrder.push([transaction.node.id])
      }
      y.edges.set(transaction.edge.id, transaction.edge)
      if (!y.edgeOrder.toArray().includes(transaction.edge.id)) {
        y.edgeOrder.push([transaction.edge.id])
      }
      return
    }

    if (transaction.type === 'upsert_node') {
      y.nodes.set(transaction.node.id, transaction.node)
      if (!y.nodeOrder.toArray().includes(transaction.node.id)) {
        y.nodeOrder.push([transaction.node.id])
      }
      return
    }

    if (transaction.type === 'update_node') {
      if (y.nodes.has(transaction.node.id)) {
        y.nodes.set(transaction.node.id, transaction.node)
      }
      return
    }

    if (transaction.type === 'remove_node') {
      y.nodes.delete(transaction.nodeId)
      const index = y.nodeOrder.toArray().indexOf(transaction.nodeId)
      if (index >= 0) {
        y.nodeOrder.delete(index, 1)
      }
      for (const [edgeId, value] of y.edges.entries()) {
        const edge = value as WorkflowCanvasEdge
        if (edge.source === transaction.nodeId || edge.target === transaction.nodeId) {
          y.edges.delete(edgeId)
          const edgeIndex = y.edgeOrder.toArray().indexOf(edgeId)
          if (edgeIndex >= 0) {
            y.edgeOrder.delete(edgeIndex, 1)
          }
        }
      }
      return
    }

    if (transaction.type === 'upsert_edge') {
      y.edges.set(transaction.edge.id, transaction.edge)
      if (!y.edgeOrder.toArray().includes(transaction.edge.id)) {
        y.edgeOrder.push([transaction.edge.id])
      }
      return
    }

    y.edges.delete(transaction.edgeId)
    const index = y.edgeOrder.toArray().indexOf(transaction.edgeId)
    if (index >= 0) {
      y.edgeOrder.delete(index, 1)
    }
  }, origin)
}
