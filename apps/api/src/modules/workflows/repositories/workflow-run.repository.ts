import type { LocalizedErrorDetails } from '@mina/contracts/schemas/api-error'
import type { WorkflowRun } from '@mina/contracts/modules/workflows'

import type {
  ClaimedWorkflowRun,
  WorkflowRunNodeDependency,
  WorkflowRunRecord,
  WorkflowRunSnapshot,
} from './workflow-types'

export interface CreateRunWithSnapshotInput {
  dependencies: WorkflowRunNodeDependency[]
  executableNodeIds: string[]
  run: WorkflowRunRecord
  snapshotEdges: WorkflowRun['snapshotEdges']
  snapshotNodes: WorkflowRun['snapshotNodes']
}

export interface ClaimWorkflowRunsInput {
  instanceId: string
  leaseSeconds: number
  limit: number
}

export interface ClaimWorkflowRunByIdInput {
  instanceId: string
  leaseSeconds: number
  runId: string
}

export interface ReleaseWorkflowRunLeaseInput {
  leaseToken: string
  nextReconcileAt?: string
  runId: string
}

export interface MarkRunTerminalInput {
  leaseToken?: string
  runId: string
  timestamp: string
}

export interface MarkRunFailedInput extends MarkRunTerminalInput {
  error: LocalizedErrorDetails
}

export interface WorkflowRunRepository {
  cancelRun(runId: string, timestamp: string): Promise<WorkflowRunRecord | undefined>
  claimRunById(input: ClaimWorkflowRunByIdInput): Promise<ClaimedWorkflowRun | undefined>
  claimRunningRuns(input: ClaimWorkflowRunsInput): Promise<ClaimedWorkflowRun[]>
  createRunWithSnapshot(input: CreateRunWithSnapshotInput): Promise<WorkflowRun>
  findRunById(id: string): Promise<WorkflowRun | undefined>
  getSnapshot(runId: string): Promise<WorkflowRunSnapshot | undefined>
  listRuns(workflowId?: string): Promise<WorkflowRun[]>
  markRunCancelled(input: MarkRunTerminalInput): Promise<WorkflowRunRecord | undefined>
  markRunFailed(input: MarkRunFailedInput): Promise<WorkflowRunRecord | undefined>
  markRunSucceeded(input: MarkRunTerminalInput): Promise<WorkflowRunRecord | undefined>
  releaseRunLease(input: ReleaseWorkflowRunLeaseInput): Promise<void>
}
