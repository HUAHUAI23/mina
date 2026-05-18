import { upgradeWebSocket } from 'hono/bun'
import { Hono } from 'hono'

import type { WorkflowEventBus } from './workflow-event-bus'

export const createWorkflowEventsRoutes = (workflowEventBus: WorkflowEventBus): Hono =>
  new Hono().get(
    '/:id/events',
    upgradeWebSocket((c) => {
      const workflowId = c.req.param('id') ?? ''
      let unsubscribe: (() => void) | undefined

      return {
        onClose: () => {
          unsubscribe?.()
        },
        onOpen: (_event, ws) => {
          unsubscribe = workflowEventBus.subscribe(workflowId, (event) => {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify(event))
            }
          })
        },
      }
    }),
  )
