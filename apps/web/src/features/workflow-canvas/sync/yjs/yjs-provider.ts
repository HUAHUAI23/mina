import { WebsocketProvider } from 'y-websocket'

import { webEnv } from '../../../../config/env'
import type { WorkflowYDocHandles } from './yjs-document'

export const workflowYjsRoomName = (workflowId: string): string => workflowId

export const workflowYjsServerUrl = (workflowId: string): string => {
  const base = webEnv.apiBaseUrl === '/' ? window.location.origin : webEnv.apiBaseUrl
  const url = new URL(`/api/workflows/${workflowId}/collab`, base)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

export const createWorkflowYjsProvider = (
  workflowId: string,
  y: WorkflowYDocHandles,
): WebsocketProvider => {
  return new WebsocketProvider(
    workflowYjsServerUrl(workflowId),
    workflowYjsRoomName(workflowId),
    y.ydoc,
    {
      connect: true,
    },
  )
}
