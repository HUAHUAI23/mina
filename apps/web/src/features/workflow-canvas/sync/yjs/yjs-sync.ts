import { useEffect, useRef } from 'react'
import * as Y from 'yjs'

import {
  incrementCanvasPerfCounter,
} from '../../diagnostics/canvas-performance-marks'
import {
  createWorkflowYDoc,
  workflowYjsSnapshotSignature,
  workflowYjsSnapshotMatches,
  type WorkflowYDocHandles,
} from './yjs-document'
import {
  applyLocalWorkflowAwareness,
  readRemoteWorkflowAwareness,
} from './yjs-awareness'
import { createWorkflowYjsProvider } from './yjs-provider'
import { exportWorkflowYjsSnapshot } from './yjs-snapshot'
import { getCanvasSnapshot, useCanvasStore } from '../../store/canvas-store'
import { useWorkflowPresenceStore } from '../workflow-presence'
import {
  getWorkflowYjsRuntimeSnapshotSignature,
  registerWorkflowYjsRuntime,
  unregisterWorkflowYjsRuntime,
  updateWorkflowYjsRuntimeConnection,
  updateWorkflowYjsRuntimeSnapshot,
} from './workflow-yjs-store'

export const useWorkflowYjsSync = (workflowId: string, enabled = true): void => {
  const hydratedWorkflowId = useCanvasStore((state) => state.hydratedWorkflowId)
  const applyRemoteSnapshot = useCanvasStore((state) => state.applyRemoteSnapshot)
  const markDraftChanged = useCanvasStore((state) => state.markDraftChanged)
  const setYjsConnectionStatus = useCanvasStore((state) => state.setYjsConnectionStatus)
  const providerRef = useRef<ReturnType<typeof createWorkflowYjsProvider> | undefined>(undefined)
  const yRef = useRef<WorkflowYDocHandles | undefined>(undefined)
  const yWorkflowIdRef = useRef<string | undefined>(undefined)

  if (enabled && (!yRef.current || yWorkflowIdRef.current !== workflowId)) {
    yRef.current = createWorkflowYDoc()
    yWorkflowIdRef.current = workflowId
  }

  useEffect(() => {
    if (!enabled) {
      return
    }
    const y = yRef.current
    if (!y || hydratedWorkflowId !== workflowId) {
      return
    }

    registerWorkflowYjsRuntime(workflowId, y, getCanvasSnapshot())
    const provider = createWorkflowYjsProvider(workflowId, y)
    providerRef.current = provider

    const projectYjsToStore = (markDirty: boolean) => {
      const snapshot = exportWorkflowYjsSnapshot(y)
      const current = getCanvasSnapshot()
      if (
        !provider.synced &&
        snapshot.nodes.length === 0 &&
        snapshot.edges.length === 0 &&
        current.workflowId === workflowId &&
        current.nodes.length > 0
      ) {
        return
      }
      const snapshotSignature = workflowYjsSnapshotSignature(snapshot)
      const currentSignature =
        current.workflowId === workflowId
          ? getWorkflowYjsRuntimeSnapshotSignature(workflowId, { edges: current.edges, nodes: current.nodes }) ??
            workflowYjsSnapshotSignature({ edges: current.edges, nodes: current.nodes })
          : ''
      updateWorkflowYjsRuntimeSnapshot(workflowId, snapshot, snapshotSignature)
      if (
        current.workflowId === workflowId &&
        snapshotSignature === currentSignature
      ) {
        return
      }
      applyRemoteSnapshot({
        allowEmpty: provider.synced,
        edges: snapshot.edges,
        nodes: snapshot.nodes,
        source: 'yjs',
        workflowId,
      })
      if (markDirty) {
        markDraftChanged()
      }
    }

    const onUpdate = (_update: Uint8Array, origin: unknown) => {
      const isLocal = origin === 'mina-local' || origin === 'mina-bootstrap'
      if (isLocal) {
        incrementCanvasPerfCounter('yjsUpdatesSent')
      } else {
        incrementCanvasPerfCounter('yjsUpdatesReceived')
      }
      projectYjsToStore(origin === 'mina-local')
    }
    const onAwarenessUpdate = () => {
      useWorkflowPresenceStore.getState().setPeers(readRemoteWorkflowAwareness(provider.awareness))
    }
    const onSync = (synced: boolean) => {
      updateWorkflowYjsRuntimeConnection(workflowId, { synced })
      if (synced) {
        setYjsConnectionStatus('synced')
        projectYjsToStore(false)
      }
    }
    const onStatus = (event: { status: 'connected' | 'connecting' | 'disconnected' }) => {
      updateWorkflowYjsRuntimeConnection(workflowId, {
        providerStatus: event.status,
        ...(event.status === 'disconnected' ? { synced: false } : {}),
      })
      setYjsConnectionStatus(event.status)
    }
    y.ydoc.on('update', onUpdate)
    provider.awareness.on('update', onAwarenessUpdate)
    provider.on('sync', onSync)
    provider.on('status', onStatus)
    projectYjsToStore(false)

    return () => {
      provider.off('sync', onSync)
      provider.off('status', onStatus)
      provider.awareness.off('update', onAwarenessUpdate)
      provider.destroy()
      providerRef.current = undefined
      y.ydoc.off('update', onUpdate)
      unregisterWorkflowYjsRuntime(workflowId, y)
      y.ydoc.destroy()
      if (yRef.current === y) {
        yRef.current = undefined
        yWorkflowIdRef.current = undefined
      }
    }
  }, [applyRemoteSnapshot, enabled, hydratedWorkflowId, markDraftChanged, setYjsConnectionStatus, workflowId])

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
