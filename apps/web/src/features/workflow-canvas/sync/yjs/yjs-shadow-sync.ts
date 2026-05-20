import { useEffect, useRef } from 'react'
import * as Y from 'yjs'

import {
  incrementCanvasPerfCounter,
  markCanvasPerformance,
} from '../../diagnostics/canvas-performance-marks'
import {
  createWorkflowYDoc,
  importWorkflowSnapshotToYjs,
  workflowYjsSnapshotMatches,
  type WorkflowYDocHandles,
} from './yjs-document'
import {
  applyLocalWorkflowAwareness,
  readRemoteWorkflowAwareness,
} from './yjs-awareness'
import { applyWorkflowTransactionToYjs } from './yjs-transactions'
import { createWorkflowYjsProvider } from './yjs-provider'
import { exportWorkflowYjsSnapshot } from './yjs-snapshot'
import { getCanvasSnapshot, useCanvasStore } from '../../store/canvas-store'
import { useWorkflowPresenceStore } from '../workflow-presence'

export const useWorkflowYjsShadowSync = (workflowId: string, enabled = true): void => {
  const nodes = useCanvasStore((state) => state.nodes)
  const edges = useCanvasStore((state) => state.edges)
  const draftRevision = useCanvasStore((state) => state.draftRevision)
  const hydratedWorkflowId = useCanvasStore((state) => state.hydratedWorkflowId)
  const lastDocumentTransaction = useCanvasStore((state) => state.lastDocumentTransaction)
  const applyRemoteSnapshot = useCanvasStore((state) => state.applyRemoteSnapshot)
  const providerRef = useRef<ReturnType<typeof createWorkflowYjsProvider> | undefined>(undefined)
  const appliedTransactionKeyRef = useRef<string | undefined>(undefined)
  const skipNextDocumentImport = useRef(false)
  const yRef = useRef<WorkflowYDocHandles | undefined>(undefined)

  if (enabled && !yRef.current) {
    yRef.current = createWorkflowYDoc()
  }

  useEffect(() => {
    if (!enabled) {
      return
    }
    const y = yRef.current
    if (!y || hydratedWorkflowId !== workflowId) {
      return
    }
    if (skipNextDocumentImport.current) {
      skipNextDocumentImport.current = false
      return
    }
    if (draftRevision > 0 && lastDocumentTransaction?.revision === draftRevision) {
      return
    }
    importWorkflowSnapshotToYjs(y, { edges, nodes }, draftRevision === 0 ? 'mina-import' : 'mina-local')
    markCanvasPerformance('yjs:shadow-sync')
  }, [draftRevision, edges, enabled, hydratedWorkflowId, lastDocumentTransaction, nodes, workflowId])

  useEffect(() => {
    if (!enabled) {
      return
    }
    const y = yRef.current
    if (!y || hydratedWorkflowId !== workflowId) {
      return
    }
    const provider = createWorkflowYjsProvider(workflowId, y)
    providerRef.current = provider
    const onUpdate = (_update: Uint8Array, origin: unknown) => {
      if (origin === 'mina-local' || origin === 'mina-import') {
        incrementCanvasPerfCounter('yjsUpdatesSent')
        return
      }
      incrementCanvasPerfCounter('yjsUpdatesReceived')
      const snapshot = exportWorkflowYjsSnapshot(y)
      skipNextDocumentImport.current = true
      applyRemoteSnapshot({
        edges: snapshot.edges,
        nodes: snapshot.nodes,
        workflowId,
      })
    }
    const onAwarenessUpdate = () => {
      useWorkflowPresenceStore.getState().setPeers(readRemoteWorkflowAwareness(provider.awareness))
    }
    y.ydoc.on('update', onUpdate)
    provider.awareness.on('update', onAwarenessUpdate)
    return () => {
      provider.awareness.off('update', onAwarenessUpdate)
      provider.destroy()
      providerRef.current = undefined
      y.ydoc.off('update', onUpdate)
    }
  }, [applyRemoteSnapshot, enabled, hydratedWorkflowId, workflowId])

  useEffect(() => {
    if (!enabled) {
      return
    }
    const y = yRef.current
    if (
      !y ||
      hydratedWorkflowId !== workflowId ||
      draftRevision === 0 ||
      lastDocumentTransaction?.revision !== draftRevision
    ) {
      return
    }
    const transactionKey = `${workflowId}:${draftRevision}`
    if (appliedTransactionKeyRef.current === transactionKey) {
      return
    }
    applyWorkflowTransactionToYjs(y, lastDocumentTransaction.transaction, 'mina-local')
    appliedTransactionKeyRef.current = transactionKey
    markCanvasPerformance('yjs:shadow-sync')
  }, [draftRevision, enabled, hydratedWorkflowId, lastDocumentTransaction, workflowId])

  useEffect(() => {
    if (!import.meta.env.DEV || !enabled) {
      return
    }
    window.__minaWorkflowCanvasYjs = {
      exportSnapshot: () => {
        const y = yRef.current
        if (!y) {
          return { edges: [], nodes: [] }
        }
        return exportWorkflowYjsSnapshot(y)
      },
      matchesDocument: () => {
        const y = yRef.current
        if (!y) {
          return false
        }
        const snapshot = getCanvasSnapshot()
        return workflowYjsSnapshotMatches(exportWorkflowYjsSnapshot(y), {
          edges: snapshot.edges,
          nodes: snapshot.nodes,
        })
      },
      stateVector: () => {
        const y = yRef.current
        return y ? Y.encodeStateVector(y.ydoc) : new Uint8Array()
      },
    }
  }, [enabled, workflowId])

  useEffect(() => {
    if (!enabled) {
      return
    }
    let lastLocalState = useWorkflowPresenceStore.getState().local
    const unsubscribe = useWorkflowPresenceStore.subscribe((state) => {
      const provider = providerRef.current
      if (!provider || state.local === lastLocalState) {
        return
      }
      lastLocalState = state.local
      applyLocalWorkflowAwareness(provider.awareness, state.local)
    })
    return unsubscribe
  }, [enabled])
}

declare global {
  interface Window {
    __minaWorkflowCanvasYjs?: {
      exportSnapshot(): { edges: unknown[]; nodes: unknown[] }
      matchesDocument(): boolean
      stateVector(): Uint8Array
    }
  }
}
