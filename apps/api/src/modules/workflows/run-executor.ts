import type { WorkflowRun } from '@mina/contracts/modules/workflows'

import { HttpError } from '../../lib/http/http-error'
import type { TaskConfigAssembler } from '../tasks/config/task-config-assembler'
import type { TasksService } from '../tasks/tasks.service'
import {
  getExecutablePredecessors,
  getNodeMap,
  isDescendantOf,
  isExecutableNode,
  sortNodesForExecution,
} from './graph'
import { WorkflowNodeExecutor } from './node-executor'
import {
  failedRun,
  settledFailedRun,
  succeededRun,
} from './run-state'
import { NoopWorkflowRunEventLog, workflowRunEventPayload, type WorkflowRunEventLog } from './workflow-events'
import type { WorkflowRepository } from './workflows.repository'

export class WorkflowRunExecutor {
  private readonly nodeExecutor: WorkflowNodeExecutor

  constructor(
    private readonly workflowRepository: WorkflowRepository,
    tasksService: TasksService,
    taskConfigAssembler: TaskConfigAssembler,
    private readonly workflowRunEventLog: WorkflowRunEventLog = new NoopWorkflowRunEventLog(),
  ) {
    this.nodeExecutor = new WorkflowNodeExecutor({
      failRun: (run, message, nodeId) => this.failRun(run, message, nodeId),
      taskConfigAssembler,
      tasksService,
      workflowRepository,
      workflowRunEventLog,
    })
  }

  async reconcileRunningRuns(): Promise<WorkflowRun[]> {
    const runningRuns = await this.workflowRepository.listRunsByStatus('running')
    const reconciled: WorkflowRun[] = []
    for (const run of runningRuns) {
      reconciled.push(await this.reconcileRun(run.id))
    }
    return reconciled
  }

  async reconcileRun(runId: string): Promise<WorkflowRun> {
    let run = await this.getRun(runId)
    if (run.status !== 'running') {
      return run
    }

    if (run.runMode === 'isolated_node') {
      const node = getNodeMap(run.snapshotNodes).get(run.selectedNodeId)
      if (!node) {
        return this.failRun(run, 'Selected node does not exist in the workflow snapshot.')
      }
      const result = await this.nodeExecutor.executeNode(run, node)
      run = result.run
      return this.finishRunIfSettled(run)
    }

    return this.reconcileFlowGroupRun(run)
  }

  private async getRun(runId: string): Promise<WorkflowRun> {
    const run = await this.workflowRepository.findRunById(runId)
    if (!run) {
      throw new HttpError(404, 'WORKFLOW_RUN_NOT_FOUND', 'Workflow run not found.')
    }
    return run
  }

  private async reconcileFlowGroupRun(initialRun: WorkflowRun): Promise<WorkflowRun> {
    let run = initialRun
    const nodeMap = getNodeMap(run.snapshotNodes)
    const scopedNodes = sortNodesForExecution(
      run.snapshotNodes.filter(
        (node) =>
          isExecutableNode(node) &&
          run.scopeGroupNodeId !== undefined &&
          isDescendantOf(node.id, run.scopeGroupNodeId, nodeMap),
      ),
    )
    const scopedNodeIds = new Set(scopedNodes.map((node) => node.id))
    const scopedEdges = run.snapshotEdges.filter(
      (edge) => scopedNodeIds.has(edge.source) && scopedNodeIds.has(edge.target),
    )

    let progressed = true
    while (progressed && run.status === 'running') {
      progressed = false

      for (const node of scopedNodes) {
        const state = run.nodeStates[node.id]
        if (!state || state.status === 'succeeded' || state.status === 'failed') {
          continue
        }

        if (state.status === 'running') {
          const result = await this.nodeExecutor.executeNode(run, node)
          run = result.run
          progressed = progressed || result.progressed
          continue
        }

        const predecessors = getExecutablePredecessors(node.id, scopedEdges, nodeMap)
        const allPredecessorsSucceeded = predecessors.every(
          (predecessor) => run.nodeStates[predecessor.id]?.status === 'succeeded',
        )

        if (!allPredecessorsSucceeded) {
          continue
        }

        const result = await this.nodeExecutor.executeNode(run, node)
        run = result.run
        progressed = progressed || result.progressed
      }
    }

    return this.finishRunIfSettled(run)
  }

  private async finishRunIfSettled(run: WorkflowRun): Promise<WorkflowRun> {
    if (run.status !== 'running') {
      return run
    }

    const states = Object.values(run.nodeStates)
    if (states.length > 0 && states.every((state) => state.status === 'succeeded' || state.status === 'skipped')) {
      const succeeded = await this.workflowRepository.updateRun(succeededRun(run))
      await this.recordWorkflowRunEvent(succeeded, 'workflow.run.succeeded', 'Workflow run completed successfully.')
      return succeeded
    }

    if (states.some((state) => state.status === 'failed')) {
      const failed = await this.workflowRepository.updateRun(settledFailedRun(run))
      await this.recordWorkflowRunEvent(failed, 'workflow.run.failed', 'Workflow run failed.', {
        error: failed.error ?? 'One or more workflow nodes failed.',
      })
      return failed
    }

    return run
  }

  private async failRun(run: WorkflowRun, message: string, nodeId?: string): Promise<WorkflowRun> {
    const failed = await this.workflowRepository.updateRun(failedRun(run, message, nodeId))
    if (nodeId) {
      await this.recordWorkflowRunEvent(failed, 'workflow.node.failed', message, {
        nodeId,
      })
    }
    await this.recordWorkflowRunEvent(failed, 'workflow.run.failed', message, {
      ...(nodeId ? { nodeId } : {}),
    })
    return failed
  }

  private async recordWorkflowRunEvent(
    run: WorkflowRun,
    eventType: string,
    message: string,
    payload: Record<string, unknown> = {},
  ): Promise<void> {
    await this.workflowRunEventLog.record({
      eventType,
      message,
      ...(typeof payload.nodeId === 'string' ? { nodeId: payload.nodeId } : {}),
      payload: {
        ...workflowRunEventPayload(run),
        ...payload,
      },
      workflowRunId: run.id,
    })
  }
}
