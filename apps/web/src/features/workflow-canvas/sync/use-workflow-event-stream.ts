import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { incrementCanvasPerfCounter } from '../diagnostics/canvas-performance-marks'
import { workflowKeys } from '../api/workflow-keys'
import { getWorkflowClientId, parseWorkflowEvent, workflowEventUrl } from '../api/workflow-ws'
import { useNodeRuntimeStore } from '../store/node-runtime-store'
import { applyWorkflowEvent, type WorkflowEventEffects } from './apply-workflow-event'

const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 30_000
const SEEN_EVENT_LIMIT = 512

/**
 * Owns the live workflow event socket: connection lifecycle, exponential-backoff reconnect, and
 * event de-duplication. Each accepted event is handed to the pure {@link applyWorkflowEvent}
 * projection, which updates the node-runtime facts layer and invalidates the relevant queries.
 */
export const useWorkflowEventStream = (workflowId: string): void => {
  const queryClient = useQueryClient()

  useEffect(() => {
    const clientId = getWorkflowClientId()
    const applyNodeTaskStatus = useNodeRuntimeStore.getState().applyNodeTaskStatus
    const effects: WorkflowEventEffects = {
      applyNodeTaskStatus,
      invalidate: (queryKey) => void queryClient.invalidateQueries({ queryKey }),
    }

    const seenEventIds = new Set<string>()
    const rememberEvent = (id: string): boolean => {
      if (seenEventIds.has(id)) {
        return false
      }
      seenEventIds.add(id)
      if (seenEventIds.size > SEEN_EVENT_LIMIT) {
        const oldest = seenEventIds.values().next().value
        if (oldest !== undefined) {
          seenEventIds.delete(oldest)
        }
      }
      return true
    }

    let socket: WebSocket | undefined
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    let reconnectAttempts = 0
    let disposed = false

    const scheduleReconnect = () => {
      if (disposed) {
        return
      }
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempts, RECONNECT_MAX_MS)
      reconnectAttempts += 1
      reconnectTimer = setTimeout(connect, delay)
    }

    function connect() {
      if (disposed) {
        return
      }
      incrementCanvasPerfCounter('websocketReconnects')
      const next = new WebSocket(workflowEventUrl(workflowId))
      socket = next
      next.onopen = () => {
        const wasReconnect = reconnectAttempts > 0
        reconnectAttempts = 0
        if (wasReconnect) {
          void queryClient.refetchQueries({ queryKey: workflowKeys.detail(workflowId), type: 'active' })
          // Reconnect can miss node task events; mark all per-node history caches stale.
          void queryClient.invalidateQueries({ queryKey: workflowKeys.nodeTasksRoot(workflowId) })
          void queryClient.invalidateQueries({ queryKey: workflowKeys.runs(workflowId) })
        }
      }
      next.onmessage = (message) => {
        if (typeof message.data !== 'string') {
          return
        }
        const event = parseWorkflowEvent(message.data)
        if (!event || event.workflowId !== workflowId || event.sourceClientId === clientId) {
          return
        }
        if (!rememberEvent(event.id)) {
          return
        }
        applyWorkflowEvent(event, { effects, workflowId })
      }
      next.onclose = () => {
        if (socket === next) {
          socket = undefined
        }
        scheduleReconnect()
      }
      next.onerror = () => {
        next.close()
      }
    }

    connect()

    return () => {
      disposed = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
      }
      const active = socket
      if (!active) {
        return
      }
      active.onclose = null
      active.onerror = null
      active.onmessage = null
      if (active.readyState === WebSocket.CONNECTING) {
        active.addEventListener('open', () => active.close(), { once: true })
        return
      }
      active.close()
    }
  }, [queryClient, workflowId])
}
