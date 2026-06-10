
import type { TaskEventInput, TaskEventLog } from '../../../modules/tasks/task-events'
import { clone } from '../shared/clone'

export class FakeTaskEventLog implements TaskEventLog {
  readonly #events: TaskEventInput[] = []

  async listEvents(taskId: string): Promise<TaskEventInput[]> {
    return this.#events.filter((event) => event.taskId === taskId).map(clone)
  }

  async record(input: TaskEventInput): Promise<void> {
    this.#events.push(clone(input))
  }
}
