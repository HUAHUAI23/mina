import type { WorkflowRun } from '@mina/contracts/modules/workflows'

import { apiEnv } from '../../config/env'
import { HttpError } from '../../lib/http/http-error'
import { createLocalizedErrorDetails } from '../../lib/http/localized-error'
import type { TaskConfigAssembler } from '../tasks/config/task-config-assembler'
import type { TasksService } from '../tasks/tasks.service'
import type { WorkflowMediaResolver } from './media/workflow-media-resolver'
import { WorkflowNodeExecutor } from './node-executor'
import type { WorkflowNodeTaskRepository } from './repositories/workflow-node-task.repository'
import type { WorkflowRunRepository } from './repositories/workflow-run.repository'
import type { WorkflowRunNodeStateRepository } from './repositories/workflow-run-node-state.repository'
import type { ClaimedWorkflowRun, WorkflowRunRecord, WorkflowRunSnapshot } from './repositories/workflow-types'
import { NoopWorkflowRunEventLog, workflowRunEventPayload, type WorkflowRunEventLog } from './workflow-events'
import {
  NoopWorkflowRunEventPublisher,
  type WorkflowRunEventPublisher,
} from './workflow-run-event-publisher'

const DEFAULT_WORKFLOW_RUN_CLAIM_BATCH_SIZE = 20
const DEFAULT_WORKFLOW_RUN_LEASE_SECONDS = 30
const DEFAULT_WORKFLOW_NODE_BATCH_SIZE = 50

interface WorkflowRunExecutorRepositories {
  nodeStates: WorkflowRunNodeStateRepository
  nodeTasks: WorkflowNodeTaskRepository
  runs: WorkflowRunRepository
}

export class WorkflowRunExecutor {
  private readonly instanceId = `workflow_scheduler_${crypto.randomUUID()}`
  private readonly nodeExecutor: WorkflowNodeExecutor

  constructor(
    private readonly repositories: WorkflowRunExecutorRepositories,
    tasksService: TasksService,
    taskConfigAssembler: TaskConfigAssembler,
    workflowMediaResolver: WorkflowMediaResolver,
    private readonly workflowRunEventLog: WorkflowRunEventLog = new NoopWorkflowRunEventLog(),
    private readonly eventPublisher: WorkflowRunEventPublisher = new NoopWorkflowRunEventPublisher(),
  ) {
    this.nodeExecutor = new WorkflowNodeExecutor({
      eventPublisher,
      nodeStates: repositories.nodeStates,
      nodeTasks: repositories.nodeTasks,
      taskConfigAssembler,
      tasksService,
      workflowMediaResolver,
      workflowRunEventLog,
    })
  }

  async reconcileRunningRuns(): Promise<WorkflowRun[]> {
    const claimed = await this.repositories.runs.claimRunningRuns({
      instanceId: this.instanceId,
      limit: DEFAULT_WORKFLOW_RUN_CLAIM_BATCH_SIZE,
      leaseSeconds: DEFAULT_WORKFLOW_RUN_LEASE_SECONDS,
    })
    const reconciled: WorkflowRun[] = []
    for (const run of claimed) {
      reconciled.push(await this.reconcileClaimedRun(run))
    }
    return reconciled
  }

  async reconcileRun(runId: string): Promise<WorkflowRun> {
    const run = await this.repositories.runs.findRunById(runId)
    if (!run) {
      throw new HttpError(404, 'WORKFLOW_RUN_NOT_FOUND', {
        fallbackMessage: 'Workflow run not found.',
        messageKey: 'api_error_workflow_run_not_found',
      })
    }
    if (run.status !== 'running') {
      return run
    }

    const claimed = await this.repositories.runs.claimRunById({
      instanceId: this.instanceId,
      runId,
      leaseSeconds: DEFAULT_WORKFLOW_RUN_LEASE_SECONDS,
    })
    if (!claimed) {
      return run
    }
    return this.reconcileClaimedRun(claimed)
  }

  private async reconcileClaimedRun(claimedRun: ClaimedWorkflowRun): Promise<WorkflowRun> {
    const snapshot = await this.repositories.runs.getSnapshot(claimedRun.id)
    if (!snapshot) {
      throw new HttpError(404, 'WORKFLOW_RUN_NOT_FOUND', {
        fallbackMessage: 'Workflow run not found.',
        messageKey: 'api_error_workflow_run_not_found',
      })
    }
    if (snapshot.run.status !== 'running') {
      return this.runDto(snapshot)
    }

    let progressed = false
    let failureMessage: string | undefined

    for (const item of await this.repositories.nodeStates.listRunningNodes({ workflowRunId: claimedRun.id })) {
      const taskId = item.state.taskId
      if (!taskId) {
        continue
      }
      const result = await this.nodeExecutor.observeRunningNode({
        run: snapshot.run,
        node: item.node,
        taskId,
      })
      progressed = progressed || result.progressed
      failureMessage = failureMessage ?? result.error
    }

    if (!failureMessage) {
      const nodeMap = new Map(snapshot.nodes.map((node) => [node.id, node]))
      for (const item of await this.repositories.nodeStates.listRunnableNodes({
        workflowRunId: claimedRun.id,
        limit: DEFAULT_WORKFLOW_NODE_BATCH_SIZE,
      })) {
        const result = await this.nodeExecutor.startNode({
          run: snapshot.run,
          node: item.node,
          edges: snapshot.edges,
          getSourceNode: async (nodeId) => nodeMap.get(nodeId),
        })
        progressed = progressed || result.progressed
        failureMessage = failureMessage ?? result.error
        if (failureMessage) {
          break
        }
      }
    }

    const terminal = await this.finishRunIfSettled(snapshot.run, claimedRun.leaseToken, failureMessage)
    if (terminal) {
      return terminal
    }

    const nextReconcileAt = progressed
      ? new Date().toISOString()
      : new Date(Date.now() + apiEnv.taskPollDefaultIntervalSeconds * 1000).toISOString()
    await this.repositories.runs.releaseRunLease({
      runId: claimedRun.id,
      leaseToken: claimedRun.leaseToken,
      nextReconcileAt,
    })
    return this.getRunOrThrow(claimedRun.id)
  }

  private async finishRunIfSettled(
    run: WorkflowRunRecord,
    leaseToken: string,
    failureMessage: string | undefined,
  ): Promise<WorkflowRun | undefined> {
    const timestamp = new Date().toISOString()
    const summary = await this.repositories.nodeStates.summarizeRunStates(run.id)

    if (failureMessage || summary.failed > 0) {
      const error = createLocalizedErrorDetails({
        code: 'WORKFLOW_RUN_FAILED',
        fallbackMessage: failureMessage ?? 'One or more workflow nodes failed.',
        messageKey: 'api_error_workflow_run_failed',
        ...(failureMessage ? { debugMessage: failureMessage } : {}),
      })
      const failed = await this.repositories.runs.markRunFailed({
        runId: run.id,
        leaseToken,
        error,
        timestamp,
      })
      if (!failed) {
        return this.getRunOrThrow(run.id)
      }
      await this.recordWorkflowRunEvent(failed, 'workflow.run.failed', failureMessage ?? 'Workflow run failed.', {
        error: failed.error?.debugMessage ?? failed.error?.message ?? failureMessage ?? 'One or more workflow nodes failed.',
      })
      this.eventPublisher.publishRunStatus({ run: failed, runId: failed.id, status: failed.status })
      return this.getRunOrThrow(run.id)
    }

    if (summary.total > 0 && summary.pending === 0 && summary.running === 0) {
      const succeeded = await this.repositories.runs.markRunSucceeded({
        runId: run.id,
        leaseToken,
        timestamp,
      })
      if (!succeeded) {
        return this.getRunOrThrow(run.id)
      }
      await this.recordWorkflowRunEvent(succeeded, 'workflow.run.succeeded', 'Workflow run completed successfully.')
      this.eventPublisher.publishRunStatus({ run: succeeded, runId: succeeded.id, status: succeeded.status })
      return this.getRunOrThrow(run.id)
    }

    return undefined
  }

  private async getRunOrThrow(runId: string): Promise<WorkflowRun> {
    const run = await this.repositories.runs.findRunById(runId)
    if (!run) {
      throw new HttpError(404, 'WORKFLOW_RUN_NOT_FOUND', {
        fallbackMessage: 'Workflow run not found.',
        messageKey: 'api_error_workflow_run_not_found',
      })
    }
    return run
  }

  private runDto(snapshot: WorkflowRunSnapshot): WorkflowRun {
    return {
      ...snapshot.run,
      snapshotNodes: snapshot.nodes,
      snapshotEdges: snapshot.edges,
      nodeStates: {},
    }
  }

  private async recordWorkflowRunEvent(
    run: WorkflowRunRecord,
    eventType: string,
    message: string,
    payload: Record<string, unknown> = {},
  ): Promise<void> {
    await this.workflowRunEventLog.record({
      eventType,
      message,
      ...(typeof payload.nodeId === 'string' ? { nodeId: payload.nodeId } : {}),
      payload: {
        ...workflowRunEventPayload({
          ...run,
          snapshotNodes: [],
          snapshotEdges: [],
          nodeStates: {},
        }),
        ...payload,
      },
      workflowRunId: run.id,
    })
  }
}
