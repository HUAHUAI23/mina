import { upgradeWebSocket } from 'hono/bun'
import { Hono } from 'hono'
import type { WorkflowSummary } from '@mina/contracts/modules/workflows'

import { HttpError } from '../../lib/http/http-error'
import { requireAuthActor } from '../accounts/auth-middleware'
import type { AccountsService } from '../accounts/accounts.service'
import type { WorkflowYjsRoomService } from './collaboration/workflow-yjs-room.service'
import type { WorkflowsService } from './workflows.service'

export const createWorkflowCollaborationRoutes = (
  workflowsService: WorkflowsService,
  accountsService: AccountsService,
  workflowYjsRoomService: WorkflowYjsRoomService,
): Hono =>
  new Hono()
    .get('/:id/collab/snapshot', async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const workflowId = c.req.param('id')
      const workflow = await workflowsService.getWorkflow(workflowId, actor.accountId)
      return c.json({ item: await workflowYjsRoomService.snapshotForWorkflow(workflow) })
    })
    .get(
      '/:id/collab/:room',
      upgradeWebSocket((c) => {
        const workflowId = c.req.param('id') ?? ''
        const room = c.req.param('room') ?? ''
        let cleanup: (() => void) | undefined
        let connectedWorkflow: WorkflowSummary | undefined

        return {
          onMessage: async (event, ws) => {
            try {
              if (room !== workflowId) {
                ws.close(1008, 'Workflow collaboration room mismatch.')
                return
              }
              if (!connectedWorkflow) {
                const actor = await requireAuthActor(c, accountsService)
                connectedWorkflow = await workflowsService.getWorkflow(workflowId, actor.accountId)
              }
              await workflowYjsRoomService.handleMessage({
                connection: ws,
                message: event.data,
                workflow: connectedWorkflow,
              })
            } catch (error) {
              if (error instanceof HttpError && error.status === 401) {
                ws.close(1008, 'Workflow collaboration access denied.')
                return
              }
              ws.close(1011, 'Workflow collaboration message failed.')
            }
          },
          onOpen: async (_event, ws) => {
            try {
              const actor = await requireAuthActor(c, accountsService)
              if (room !== workflowId) {
                ws.close(1008, 'Workflow collaboration room mismatch.')
                return
              }
              connectedWorkflow = await workflowsService.getWorkflow(workflowId, actor.accountId)
              cleanup = await workflowYjsRoomService.connect({ connection: ws, workflow: connectedWorkflow })
            } catch {
              ws.close(1008, 'Workflow collaboration access denied.')
            }
          },
          onClose: () => {
            cleanup?.()
          },
        }
      }),
    )
