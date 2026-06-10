import { upgradeWebSocket } from 'hono/bun'
import { Hono } from 'hono'

import { requireAllowedWebSocketOrigin } from '../../lib/http/websocket-origin'
import { requireBrowserWebSocketAuthActor } from '../accounts/auth-middleware'
import type { AccountsService } from '../accounts/accounts.service'
import type { WorkflowEventBus } from './workflow-event-bus'
import type { WorkflowsService } from './workflows.service'

export const createWorkflowEventsRoutes = (
  workflowEventBus: WorkflowEventBus,
  workflowsService: WorkflowsService,
  accountsService: AccountsService,
): Hono =>
  new Hono().get(
    '/:id/events',
    async (c, next) => {
      requireAllowedWebSocketOrigin(c)
      const actor = await requireBrowserWebSocketAuthActor(c, accountsService)
      const workflowId = c.req.param('id')
      await workflowsService.getWorkflow(workflowId, actor.accountId)
      await next()
    },
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
