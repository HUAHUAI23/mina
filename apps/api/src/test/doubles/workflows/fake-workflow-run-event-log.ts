
import type { WorkflowRunEventInput, WorkflowRunEventLog } from '../../../modules/workflows/workflow-events'
import { clone } from '../shared/clone'

export class FakeWorkflowRunEventLog implements WorkflowRunEventLog {
  readonly #events: WorkflowRunEventInput[] = []

  async listEvents(workflowRunId: string): Promise<WorkflowRunEventInput[]> {
    return this.#events.filter((event) => event.workflowRunId === workflowRunId).map(clone)
  }

  async record(input: WorkflowRunEventInput): Promise<void> {
    this.#events.push(clone(input))
  }
}
