
import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import type { WorkflowRun, WorkflowRunNodeState } from '@mina/contracts/modules/workflows'

import type { WorkflowRunDependencyRepository } from '../../../modules/workflows/repositories/workflow-run-dependency.repository'
import type {
  ClaimWorkflowRunByIdInput,
  ClaimWorkflowRunsInput,
  CreateRunWithSnapshotInput,
  MarkRunFailedInput,
  MarkRunTerminalInput,
  ReleaseWorkflowRunLeaseInput,
  WorkflowRunRepository,
} from '../../../modules/workflows/repositories/workflow-run.repository'
import type {
  ListRunnableNodesInput,
  ListRunningNodesInput,
  MarkNodeFailedInput,
  MarkNodeRunningInput,
  MarkNodeSucceededInput,
  TryMarkNodeStartingInput,
  WorkflowRunNodeStateRepository,
} from '../../../modules/workflows/repositories/workflow-run-node-state.repository'
import {
  cloneRun,
  normalizeWorkflowEdge,
  normalizeWorkflowNode,
  workflowRunDto,
} from '../../../modules/workflows/repositories/workflow-mappers'
import type {
  ClaimedWorkflowRun,
  WorkflowRunNodeDependency,
  WorkflowRunNodeExecutionItem,
  WorkflowRunRecord,
  WorkflowRunSnapshot,
  WorkflowRunStateSummary,
} from '../../../modules/workflows/repositories/workflow-types'
import { clone } from '../shared/clone'

const isoDateOrUndefined = (value: string | undefined): Date | undefined => (value ? new Date(value) : undefined)

interface StoredRun {
  dependencies: WorkflowRunNodeDependency[]
  executableNodeIds: string[]
  leasedBy: string | undefined
  leaseToken: string | undefined
  leaseUntil: string | undefined
  nextReconcileAt: string | undefined
  run: WorkflowRunRecord
  snapshotEdges: WorkflowCanvasEdge[]
  snapshotNodes: WorkflowCanvasNode[]
  states: Record<string, WorkflowRunNodeState>
}

export class FakeWorkflowRunRepository
  implements WorkflowRunRepository, WorkflowRunNodeStateRepository, WorkflowRunDependencyRepository
{
  readonly #runs = new Map<string, StoredRun>()

  async cancelRun(runId: string, timestamp: string): Promise<WorkflowRunRecord | undefined> {
    const stored = this.#runs.get(runId)
    if (!stored || (stored.run.status !== 'running' && stored.run.status !== 'queued')) {
      return undefined
    }
    stored.run = {
      ...stored.run,
      completedAt: timestamp,
      status: 'cancelled',
      updatedAt: timestamp,
    }
    return clone(stored.run)
  }

  async claimRunById(input: ClaimWorkflowRunByIdInput): Promise<ClaimedWorkflowRun | undefined> {
    const now = new Date()
    const stored = this.#runs.get(input.runId)
    const leaseUntil = isoDateOrUndefined(stored?.leaseUntil)
    if (!stored || stored.run.status !== 'running' || (leaseUntil && leaseUntil > now)) {
      return undefined
    }

    const leaseToken = `lease_${crypto.randomUUID()}`
    stored.leasedBy = input.instanceId
    stored.leaseToken = leaseToken
    stored.leaseUntil = new Date(now.getTime() + input.leaseSeconds * 1000).toISOString()
    stored.run = {
      ...stored.run,
      updatedAt: now.toISOString(),
    }
    return {
      ...clone(stored.run),
      leaseToken,
    }
  }

  async claimRunningRuns(input: ClaimWorkflowRunsInput): Promise<ClaimedWorkflowRun[]> {
    const now = new Date()
    const claimed: ClaimedWorkflowRun[] = []
    const candidates = [...this.#runs.values()]
      .filter((stored) => {
        const nextReconcileAt = isoDateOrUndefined(stored.nextReconcileAt)
        const leaseUntil = isoDateOrUndefined(stored.leaseUntil)
        return (
          stored.run.status === 'running' &&
          (!nextReconcileAt || nextReconcileAt <= now) &&
          (!leaseUntil || leaseUntil <= now)
        )
      })
      .sort((left, right) => left.run.updatedAt.localeCompare(right.run.updatedAt))
      .slice(0, input.limit)

    for (const stored of candidates) {
      const leaseToken = `lease_${crypto.randomUUID()}`
      const updatedAt = now.toISOString()
      stored.leasedBy = input.instanceId
      stored.leaseToken = leaseToken
      stored.leaseUntil = new Date(now.getTime() + input.leaseSeconds * 1000).toISOString()
      stored.run = {
        ...stored.run,
        updatedAt,
      }
      claimed.push({
        ...clone(stored.run),
        leaseToken,
      })
    }

    return claimed
  }

  async createRunWithSnapshot(input: CreateRunWithSnapshotInput): Promise<WorkflowRun> {
    const states = Object.fromEntries(
      input.executableNodeIds.map((nodeId) => [nodeId, { status: 'pending' as const }]),
    )
    const stored: StoredRun = {
      dependencies: input.dependencies.map(clone),
      executableNodeIds: [...input.executableNodeIds],
      leasedBy: undefined,
      leaseToken: undefined,
      leaseUntil: undefined,
      nextReconcileAt: undefined,
      run: clone(input.run),
      snapshotEdges: input.snapshotEdges.map(normalizeWorkflowEdge),
      snapshotNodes: input.snapshotNodes.map(normalizeWorkflowNode),
      states,
    }
    this.#runs.set(input.run.id, stored)
    return this.runDto(stored)
  }

  async findRunById(id: string): Promise<WorkflowRun | undefined> {
    const stored = this.#runs.get(id)
    return stored ? this.runDto(stored) : undefined
  }

  async getNodeState(workflowRunId: string, nodeId: string): Promise<WorkflowRunNodeState | undefined> {
    const state = this.#runs.get(workflowRunId)?.states[nodeId]
    return state ? clone(state) : undefined
  }

  async getSnapshot(runId: string): Promise<WorkflowRunSnapshot | undefined> {
    const stored = this.#runs.get(runId)
    if (!stored) {
      return undefined
    }
    return {
      dependencies: stored.dependencies.map(clone),
      edges: stored.snapshotEdges.map(normalizeWorkflowEdge),
      executableNodeIds: [...stored.executableNodeIds],
      nodes: stored.snapshotNodes.map(normalizeWorkflowNode),
      run: clone(stored.run),
    }
  }

  async listDependencies(workflowRunId: string): Promise<WorkflowRunNodeDependency[]> {
    return (this.#runs.get(workflowRunId)?.dependencies ?? []).map(clone)
  }

  async listRunnableNodes(input: ListRunnableNodesInput): Promise<WorkflowRunNodeExecutionItem[]> {
    const stored = this.#runs.get(input.workflowRunId)
    if (!stored) {
      return []
    }

    const succeeded = new Set(
      Object.entries(stored.states)
        .filter(([, state]) => state.status === 'succeeded')
        .map(([nodeId]) => nodeId),
    )
    const nodeMap = new Map(stored.snapshotNodes.map((node) => [node.id, node]))
    return Object.entries(stored.states)
      .filter(([nodeId, state]) => {
        if (state.status !== 'pending') {
          return false
        }
        return stored.dependencies
          .filter((dependency) => dependency.nodeId === nodeId)
          .every((dependency) => succeeded.has(dependency.dependsOnNodeId))
      })
      .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
      .slice(0, input.limit)
      .map(([nodeId, state]) => ({
        node: normalizeWorkflowNode(nodeMap.get(nodeId) ?? this.missingNode(nodeId)),
        state: {
          nodeId,
          ...(state.taskId ? { taskId: state.taskId } : {}),
        },
      }))
  }

  async listRunningNodes(input: ListRunningNodesInput): Promise<WorkflowRunNodeExecutionItem[]> {
    const stored = this.#runs.get(input.workflowRunId)
    if (!stored) {
      return []
    }
    const nodeMap = new Map(stored.snapshotNodes.map((node) => [node.id, node]))
    return Object.entries(stored.states)
      .filter(([, state]) => state.status === 'running')
      .map(([nodeId, state]) => ({
        node: normalizeWorkflowNode(nodeMap.get(nodeId) ?? this.missingNode(nodeId)),
        state: {
          nodeId,
          ...(state.taskId ? { taskId: state.taskId } : {}),
        },
      }))
  }

  async listRuns(workflowId?: string): Promise<WorkflowRun[]> {
    return [...this.#runs.values()]
      .filter((stored) => !workflowId || stored.run.workflowId === workflowId)
      .sort((left, right) => right.run.createdAt.localeCompare(left.run.createdAt))
      .map((stored) => this.runDto(stored))
  }

  async markNodeFailed(input: MarkNodeFailedInput): Promise<boolean> {
    const stored = this.#runs.get(input.workflowRunId)
    const state = stored?.states[input.nodeId]
    const expectedStatus = input.expectedStatus ?? 'running'
    if (!stored || !state || state.status !== expectedStatus) {
      return false
    }
    if (input.taskId && state.taskId !== input.taskId) {
      return false
    }
    stored.states[input.nodeId] = {
      ...state,
      completedAt: input.completedAt,
      error: input.error,
      status: 'failed',
    }
    stored.run.updatedAt = input.completedAt
    return true
  }

  async markNodeRunning(input: MarkNodeRunningInput): Promise<boolean> {
    const stored = this.#runs.get(input.workflowRunId)
    const state = stored?.states[input.nodeId]
    if (!stored || !state || state.status !== 'pending') {
      return false
    }
    stored.states[input.nodeId] = {
      startedAt: input.startedAt,
      status: 'running',
      taskId: input.taskId,
    }
    stored.run.updatedAt = input.startedAt
    return true
  }

  async markNodeSucceeded(input: MarkNodeSucceededInput): Promise<boolean> {
    const stored = this.#runs.get(input.workflowRunId)
    const state = stored?.states[input.nodeId]
    if (!stored || !state || state.status !== 'running' || state.taskId !== input.taskId) {
      return false
    }
    stored.states[input.nodeId] = {
      ...state,
      completedAt: input.completedAt,
      output: input.output,
      status: 'succeeded',
    }
    stored.run.updatedAt = input.completedAt
    return true
  }

  async markRunCancelled(input: MarkRunTerminalInput): Promise<WorkflowRunRecord | undefined> {
    return this.markTerminal(input, 'cancelled')
  }

  async markRunFailed(input: MarkRunFailedInput): Promise<WorkflowRunRecord | undefined> {
    return this.markTerminal(input, 'failed', input.error)
  }

  async markRunSucceeded(input: MarkRunTerminalInput): Promise<WorkflowRunRecord | undefined> {
    return this.markTerminal(input, 'succeeded')
  }

  async releaseRunLease(input: ReleaseWorkflowRunLeaseInput): Promise<void> {
    const stored = this.#runs.get(input.runId)
    if (!stored || stored.leaseToken !== input.leaseToken) {
      return
    }
    stored.leasedBy = undefined
    stored.leaseToken = undefined
    stored.leaseUntil = undefined
    stored.nextReconcileAt = input.nextReconcileAt
    stored.run.updatedAt = new Date().toISOString()
  }

  async summarizeRunStates(workflowRunId: string): Promise<WorkflowRunStateSummary> {
    const states = Object.values(this.#runs.get(workflowRunId)?.states ?? {})
    const summary: WorkflowRunStateSummary = {
      failed: 0,
      pending: 0,
      running: 0,
      skipped: 0,
      succeeded: 0,
      total: states.length,
    }
    for (const state of states) {
      summary[state.status] += 1
    }
    return summary
  }

  async tryMarkNodeStarting(input: TryMarkNodeStartingInput): Promise<boolean> {
    const state = this.#runs.get(input.workflowRunId)?.states[input.nodeId]
    return state?.status === 'pending'
  }

  private markTerminal(
    input: MarkRunTerminalInput,
    status: WorkflowRunRecord['status'],
    error?: WorkflowRunRecord['error'],
  ): WorkflowRunRecord | undefined {
    const stored = this.#runs.get(input.runId)
    if (!stored || stored.run.status !== 'running') {
      return undefined
    }
    if (input.leaseToken && stored.leaseToken !== input.leaseToken) {
      return undefined
    }
    stored.run = {
      ...stored.run,
      ...(error ? { error } : {}),
      completedAt: input.timestamp,
      status,
      updatedAt: input.timestamp,
    }
    return clone(stored.run)
  }

  private missingNode(nodeId: string): WorkflowCanvasNode {
    throw new Error(`Workflow run node snapshot "${nodeId}" is missing.`)
  }

  private runDto(stored: StoredRun): WorkflowRun {
    return cloneRun(
      workflowRunDto({
        nodeStates: stored.states,
        run: stored.run,
        snapshotEdges: stored.snapshotEdges,
        snapshotNodes: stored.snapshotNodes,
      }),
    )
  }
}
