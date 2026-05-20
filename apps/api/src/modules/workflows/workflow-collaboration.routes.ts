import { upgradeWebSocket } from 'hono/bun'
import { Hono } from 'hono'
import { sValidator } from '@hono/standard-validator'
import { CheckpointWorkflowCollaborationSchema } from '@mina/contracts/modules/workflows'
import type { Workflow } from '@mina/contracts/modules/workflows'

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
    .post(
      '/:id/collab/checkpoint',
      sValidator('json', CheckpointWorkflowCollaborationSchema),
      async (c) => {
        const actor = await requireAuthActor(c, accountsService)
        const workflowId = c.req.param('id')
        const payload = c.req.valid('json')
        const workflow = await workflowsService.getWorkflow(workflowId, actor.accountId)
        const result = await workflowYjsRoomService.checkpointWorkflowReadModel(workflow, async (snapshot) => ({
          item: await workflowsService.checkpointWorkflow(
            workflowId,
            {
              edges: snapshot.edges,
              nodes: snapshot.nodes,
              ...(payload.name ? { name: payload.name } : {}),
            },
            actor.accountId,
          ),
          yjsStateVector: Array.from(snapshot.yjsStateVector),
        }))
        return c.json(result)
      },
    )
    .get(
      '/:id/collab/:room',
      upgradeWebSocket((c) => {
        const workflowId = c.req.param('id') ?? ''
        const room = c.req.param('room') ?? ''
        let cleanup: (() => void) | undefined
        let connectedWorkflow: Workflow | undefined

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
            } catch {
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
