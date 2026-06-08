import type {
  CreateWorkflowInput,
  CreateWorkflowRunInput,
  UpdateWorkflowInput,
  Workflow,
  WorkflowNodeRuntime,
  WorkflowNodeTaskHistoryItem,
  WorkflowRun,
  WorkflowSummary,
} from '@mina/contracts/modules/workflows'
import type { Task } from '@mina/contracts/modules/tasks'
import type { WorkflowEvent } from '@mina/contracts/modules/workflows/events'
import type { MinaLocale } from '@mina/i18n'

import { HttpError } from '../../lib/http/http-error'
import type { TaskConfigAssembler } from '../tasks/config/task-config-assembler'
import type { TasksService } from '../tasks/tasks.service'
import type { WorkflowMediaResolver } from './media/workflow-media-resolver'
import type { WorkflowDefinitionRepository } from './repositories/workflow-definition.repository'
import type { WorkflowNodeTaskRepository } from './repositories/workflow-node-task.repository'
import type { WorkflowRunRepository } from './repositories/workflow-run.repository'
import type { WorkflowRunNodeStateRepository } from './repositories/workflow-run-node-state.repository'
import { validateCanvas } from './validation'
import { createWorkflowEventId, type WorkflowEventBus } from './workflow-event-bus'
import { NoopWorkflowRunEventLog, type WorkflowRunEventLog } from './workflow-events'
import {
  NoopWorkflowRunEventPublisher,
  type WorkflowRunEventPublisher,
} from './workflow-run-event-publisher'
import { WorkflowRunsService } from './workflow-runs.service'
import { materializeEffectiveMediaViews } from './media/materialize-effective-media-views'
import type { WorkflowYjsRoomService, WorkflowYjsSnapshot } from './collaboration/workflow-yjs-room.service'

const nowIso = (): string => new Date().toISOString()

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`

const cloneNodes = (nodes: Workflow['nodes']): Workflow['nodes'] => structuredClone(nodes)
const cloneEdges = (edges: Workflow['edges']): Workflow['edges'] => structuredClone(edges)

interface WorkflowsServiceRepositories {
  definitions: WorkflowDefinitionRepository
  nodeStates: WorkflowRunNodeStateRepository
  nodeTasks: WorkflowNodeTaskRepository
  runs: WorkflowRunRepository
}

export class WorkflowsService {
  private readonly workflowRunsService: WorkflowRunsService

  constructor(
    private readonly repositories: WorkflowsServiceRepositories,
    tasksService: TasksService,
    taskConfigAssembler: TaskConfigAssembler,
    workflowMediaResolver: WorkflowMediaResolver,
    private readonly workflowYjsRoomService: WorkflowYjsRoomService,
    workflowRunEventLog: WorkflowRunEventLog = new NoopWorkflowRunEventLog(),
    private readonly workflowRunEventPublisher: WorkflowRunEventPublisher = new NoopWorkflowRunEventPublisher(),
    private readonly workflowEventBus?: WorkflowEventBus,
  ) {
    this.workflowRunsService = new WorkflowRunsService(
      repositories,
      tasksService,
      taskConfigAssembler,
      workflowMediaResolver,
      workflowRunEventLog,
      workflowRunEventPublisher,
    )
  }

  async createWorkflow(input: CreateWorkflowInput, accountId: string): Promise<Workflow> {
    const timestamp = nowIso()
    const nodes = cloneNodes(input.nodes)
    const edges = cloneEdges(input.edges)
    validateCanvas(nodes, edges)
    const metadata = await this.repositories.definitions.create({
      id: createId('workflow'),
      accountId,
      name: input.name,
      version: 1,
      timestamp,
    })
    const yjsSnapshot = await this.workflowYjsRoomService.initializeWorkflow(metadata, { edges, nodes })
    const workflow = this.workflowFromSnapshot(metadata, yjsSnapshot)
    return workflow
  }

  async deleteWorkflow(id: string, accountId: string): Promise<void> {
    await this.getWorkflow(id, accountId)
    const deleted = await this.repositories.definitions.delete(id)
    if (!deleted) {
      throw new HttpError(404, 'WORKFLOW_NOT_FOUND', {
        fallbackMessage: 'Workflow not found.',
        messageKey: 'api_error_workflow_not_found',
      })
    }
  }

  async getNodeTasks(
    workflowId: string,
    nodeId: string,
    accountId: string,
    locale?: MinaLocale,
  ): Promise<WorkflowNodeTaskHistoryItem[]> {
    await this.getWorkflow(workflowId, accountId)
    const links = await this.repositories.nodeTasks.listNodeTaskLinks(workflowId, nodeId)
    const hydrated = await Promise.all(
      links.map(async (link) => ({
        workflowRunId: link.workflowRunId,
        nodeId: link.nodeId,
        task: locale
          ? await this.workflowRunsService.getTaskLocalized(accountId, link.taskId, locale)
          : await this.workflowRunsService.getTask(accountId, link.taskId),
      })),
    )
    return hydrated.sort((left, right) => right.task.createdAt.localeCompare(left.task.createdAt))
  }

  async getRun(runId: string, accountId: string, locale?: MinaLocale): Promise<WorkflowRun> {
    const run = await this.workflowRunsService.getRun(runId)
    this.assertAccountAccess(run.accountId, accountId)
    return locale ? this.workflowRunsService.localizeRun(run, locale) : run
  }

  async getWorkflow(id: string, accountId: string): Promise<Workflow> {
    const metadata = await this.repositories.definitions.findById(id)
    if (!metadata) {
      throw new HttpError(404, 'WORKFLOW_NOT_FOUND', {
        fallbackMessage: 'Workflow not found.',
        messageKey: 'api_error_workflow_not_found',
      })
    }
    this.assertAccountAccess(metadata.accountId, accountId)
    return this.workflowFromSnapshot(metadata, await this.workflowYjsRoomService.snapshotForWorkflow(metadata))
  }

  async listNodeRuntime(id: string, accountId: string): Promise<WorkflowNodeRuntime[]> {
    const metadata = await this.repositories.definitions.findById(id)
    if (!metadata) {
      throw new HttpError(404, 'WORKFLOW_NOT_FOUND', {
        fallbackMessage: 'Workflow not found.',
        messageKey: 'api_error_workflow_not_found',
      })
    }
    this.assertAccountAccess(metadata.accountId, accountId)
    const rows = await this.repositories.nodeTasks.listLatestNodeTasks(id)
    return rows.map((row) => ({
      latestTaskCreatedAt: row.latestTaskCreatedAt,
      latestTaskId: row.latestTaskId,
      nodeId: row.nodeId,
      status: row.status,
      statusUpdatedAt: row.statusUpdatedAt,
    }))
  }

  async listRuns(workflowId: string, accountId: string, locale?: MinaLocale): Promise<WorkflowRun[]> {
    await this.getWorkflow(workflowId, accountId)
    return locale ? this.workflowRunsService.listRunsLocalized(workflowId, locale) : this.workflowRunsService.listRuns(workflowId)
  }

  async listWorkflows(accountId: string): Promise<WorkflowSummary[]> {
    return this.repositories.definitions.list(accountId)
  }

  async updateWorkflow(id: string, input: UpdateWorkflowInput, accountId: string): Promise<Workflow> {
    await this.getWorkflow(id, accountId)
    const metadata = await this.repositories.definitions.updateName(id, input.name, nowIso())
    if (!metadata) {
      throw new HttpError(404, 'WORKFLOW_NOT_FOUND', {
        fallbackMessage: 'Workflow not found.',
        messageKey: 'api_error_workflow_not_found',
      })
    }
    return this.workflowFromSnapshot(metadata, await this.workflowYjsRoomService.snapshotForWorkflow(metadata))
  }

  async createRun(
    workflowId: string,
    input: CreateWorkflowRunInput,
    accountId: string,
    locale?: MinaLocale,
  ): Promise<WorkflowRun> {
    const metadata = await this.getWorkflowMetadata(workflowId, accountId)
    const snapshot = await this.workflowYjsRoomService.compactWorkflow(metadata, 'create_run')
    if (snapshot.version !== metadata.version) {
      await this.repositories.definitions.touch(metadata.id, nowIso(), snapshot.version)
    }
    const workflow = this.workflowFromSnapshot({ ...metadata, version: snapshot.version }, snapshot)
    const nodeRuntime = await this.repositories.nodeTasks.listLatestNodeTasks(workflow.id)
    const run = await this.workflowRunsService.createRunFromSnapshot(
      {
        ...workflow,
        nodes: materializeEffectiveMediaViews(workflow.nodes, nodeRuntime),
      },
      input,
    )
    // The initial "running" signal; per-node task transitions are owned by the run executor's
    // event publisher (startNode/observeRunningNode), which fires during the synchronous reconcile.
    this.publishWorkflowEvent({
      id: createWorkflowEventId(),
      accountId: run.accountId,
      createdAt: run.updatedAt,
      payload: { runId: run.id, status: run.status },
      type: 'workflow.run.updated',
      version: run.workflowVersion,
      workflowId: run.workflowId,
    })
    return locale ? this.workflowRunsService.localizeRun(run, locale) : run
  }

  async cancelRun(runId: string, accountId: string): Promise<void> {
    await this.getRun(runId, accountId)
    await this.workflowRunsService.cancelRun(runId)
  }

  async reconcileRunningRuns(): Promise<WorkflowRun[]> {
    return this.workflowRunsService.reconcileRunningRuns()
  }

  async reconcileRun(runId: string): Promise<WorkflowRun> {
    return this.workflowRunsService.reconcileRun(runId)
  }

  async publishTaskStatusUpdates(tasks: readonly Task[]): Promise<void> {
    if (tasks.length === 0) {
      return
    }
    const taskById = new Map(tasks.map((task) => [task.id, task]))
    const links = await this.repositories.nodeTasks.listTaskRuntimeLinks([...taskById.keys()])
    for (const link of links) {
      const task = taskById.get(link.taskId)
      if (!task) {
        continue
      }
      this.workflowRunEventPublisher.publishNodeTaskStatus({
        nodeId: link.nodeId,
        run: {
          accountId: link.accountId,
          workflowId: link.workflowId,
          workflowVersion: link.workflowVersion,
        },
        status: task.status,
        taskCreatedAt: task.createdAt,
        taskId: task.id,
        taskUpdatedAt: task.updatedAt,
      })
    }
  }

  private publishWorkflowEvent(event: WorkflowEvent): void {
    this.workflowEventBus?.publish(event)
  }

  private async getWorkflowMetadata(id: string, accountId: string): Promise<WorkflowSummary> {
    const metadata = await this.repositories.definitions.findById(id)
    if (!metadata) {
      throw new HttpError(404, 'WORKFLOW_NOT_FOUND', {
        fallbackMessage: 'Workflow not found.',
        messageKey: 'api_error_workflow_not_found',
      })
    }
    this.assertAccountAccess(metadata.accountId, accountId)
    return metadata
  }

  private workflowFromSnapshot(metadata: WorkflowSummary, snapshot: WorkflowYjsSnapshot): Workflow {
    return {
      id: metadata.id,
      accountId: metadata.accountId,
      name: metadata.name,
      version: snapshot.version,
      nodes: snapshot.nodes,
      edges: snapshot.edges,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
    }
  }

  private assertAccountAccess(resourceAccountId: string, expectedAccountId: string): void {
    if (resourceAccountId !== expectedAccountId) {
      throw new HttpError(404, 'WORKFLOW_NOT_FOUND', {
        fallbackMessage: 'Workflow not found.',
        messageKey: 'api_error_workflow_not_found',
      })
    }
  }
}
