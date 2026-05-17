import type { WorkflowRun } from '@mina/contracts/modules/workflows'

import type { MinaDbClient } from '../../db/client'
import { workflowRunEvents } from '../../db/schema'

export interface WorkflowRunEventInput {
  eventType: string
  message?: string
  nodeId?: string
  payload?: Record<string, unknown>
  workflowRunId: string
}

export interface WorkflowRunEventLog {
  listEvents?(workflowRunId: string): Promise<WorkflowRunEventInput[]>
  record(input: WorkflowRunEventInput): Promise<void>
}

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`

export const workflowRunEventPayload = (run: WorkflowRun): Record<string, unknown> => ({
  accountId: run.accountId,
  runMode: run.runMode,
  selectedNodeId: run.selectedNodeId,
  status: run.status,
  workflowId: run.workflowId,
  workflowVersion: run.workflowVersion,
  ...(run.scopeGroupNodeId ? { scopeGroupNodeId: run.scopeGroupNodeId } : {}),
})

export class NoopWorkflowRunEventLog implements WorkflowRunEventLog {
  async record(_input: WorkflowRunEventInput): Promise<void> {}
}

export class DrizzleWorkflowRunEventLog implements WorkflowRunEventLog {
  constructor(private readonly db: MinaDbClient) {}

  async record(input: WorkflowRunEventInput): Promise<void> {
    await this.db.insert(workflowRunEvents).values({
      id: createId('workflow_run_event'),
      workflowRunId: input.workflowRunId,
      nodeId: input.nodeId ?? null,
      eventType: input.eventType,
      message: input.message ?? null,
      payload: input.payload ?? null,
    })
  }
}
