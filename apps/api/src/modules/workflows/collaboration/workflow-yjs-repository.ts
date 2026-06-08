export interface WorkflowYjsSnapshotRecord {
  expectedVersion?: number
  snapshotBin: Uint8Array
  stateVector: Uint8Array
  version: number
  workflowId: string
}

export interface WorkflowYjsUpdateRecord {
  createdAt: string
  id: string
  updateBin: Uint8Array
  workflowId: string
}

export interface WorkflowYjsRepository {
  appendUpdate(input: { id: string; updateBin: Uint8Array; workflowId: string }): Promise<void>
  deleteUpdates(workflowId: string, updateIds?: readonly string[]): Promise<void>
  getSnapshot(workflowId: string): Promise<WorkflowYjsSnapshotRecord | undefined>
  listUpdates(workflowId: string, after?: Date): Promise<WorkflowYjsUpdateRecord[]>
  saveSnapshot(input: WorkflowYjsSnapshotRecord): Promise<boolean>
}
