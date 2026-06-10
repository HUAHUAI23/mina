
import type {
  WorkflowYjsRepository,
  WorkflowYjsSnapshotRecord,
  WorkflowYjsUpdateRecord,
} from '../../../modules/workflows/collaboration/workflow-yjs-repository'

export class FakeWorkflowYjsRepository implements WorkflowYjsRepository {
  readonly #snapshots = new Map<string, WorkflowYjsSnapshotRecord>()
  readonly #updates = new Map<string, WorkflowYjsUpdateRecord[]>()

  async appendUpdate(input: { id: string; updateBin: Uint8Array; workflowId: string }): Promise<void> {
    const updates = this.#updates.get(input.workflowId) ?? []
    updates.push({
      createdAt: new Date().toISOString(),
      id: input.id,
      updateBin: new Uint8Array(input.updateBin),
      workflowId: input.workflowId,
    })
    this.#updates.set(input.workflowId, updates)
  }

  async deleteUpdates(workflowId: string, updateIds?: readonly string[]): Promise<void> {
    if (!updateIds) {
      this.#updates.delete(workflowId)
      return
    }
    if (updateIds.length === 0) {
      return
    }
    const deletedIds = new Set(updateIds)
    this.#updates.set(
      workflowId,
      (this.#updates.get(workflowId) ?? []).filter((update) => !deletedIds.has(update.id)),
    )
  }

  async getSnapshot(workflowId: string): Promise<WorkflowYjsSnapshotRecord | undefined> {
    const snapshot = this.#snapshots.get(workflowId)
    return snapshot
      ? {
          snapshotBin: new Uint8Array(snapshot.snapshotBin),
          stateVector: new Uint8Array(snapshot.stateVector),
          version: snapshot.version,
          workflowId: snapshot.workflowId,
        }
      : undefined
  }

  async listUpdates(workflowId: string, after?: Date): Promise<WorkflowYjsUpdateRecord[]> {
    return (this.#updates.get(workflowId) ?? [])
      .filter((update) => !after || new Date(update.createdAt) > after)
      .map((update) => ({
        createdAt: update.createdAt,
        id: update.id,
        updateBin: new Uint8Array(update.updateBin),
        workflowId: update.workflowId,
      }))
  }

  async saveSnapshot(input: WorkflowYjsSnapshotRecord): Promise<boolean> {
    const current = this.#snapshots.get(input.workflowId)
    if (input.expectedVersion !== undefined && current?.version !== input.expectedVersion) {
      return false
    }

    this.#snapshots.set(input.workflowId, {
      snapshotBin: new Uint8Array(input.snapshotBin),
      stateVector: new Uint8Array(input.stateVector),
      version: input.version,
      workflowId: input.workflowId,
    })
    return true
  }
}
