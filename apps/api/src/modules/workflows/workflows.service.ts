import type {
  CreateWorkflowInput,
  CreateWorkflowRunInput,
  Workflow,
  WorkflowNodeTaskHistoryItem,
  WorkflowRun,
} from '@mina/contracts/modules/workflows'
import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import type { WorkflowEvent } from '@mina/contracts/modules/workflows/events'

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
import { WorkflowRunsService } from './workflow-runs.service'

const nowIso = (): string => new Date().toISOString()

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`

const cloneNodes = (nodes: WorkflowCanvasNode[]): WorkflowCanvasNode[] => structuredClone(nodes)
const cloneEdges = (edges: WorkflowCanvasEdge[]): WorkflowCanvasEdge[] => structuredClone(edges)

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
    workflowRunEventLog: WorkflowRunEventLog = new NoopWorkflowRunEventLog(),
    private readonly workflowEventBus?: WorkflowEventBus,
  ) {
    this.workflowRunsService = new WorkflowRunsService(
      repositories,
      tasksService,
      taskConfigAssembler,
      workflowMediaResolver,
      workflowRunEventLog,
    )
  }

  async createWorkflow(input: CreateWorkflowInput, accountId: string): Promise<Workflow> {
    const timestamp = nowIso()
    const nodes = cloneNodes(input.nodes)
    const edges = cloneEdges(input.edges)
    validateCanvas(nodes, edges)
    const workflow = await this.repositories.definitions.create({
      id: createId('workflow'),
      accountId,
      name: input.name,
      version: 1,
      nodes,
      edges,
      timestamp,
    })
    this.publishWorkflowEvent({
      id: createWorkflowEventId(),
      accountId: workflow.accountId,
      createdAt: timestamp,
      payload: {
        changedEdgeIds: workflow.edges.map((edge) => edge.id),
        changedNodeIds: workflow.nodes.map((node) => node.id),
      },
      type: 'workflow.definition.updated',
      version: workflow.version,
      workflowId: workflow.id,
    })
    return workflow
  }

  async deleteWorkflow(id: string, accountId: string): Promise<void> {
    await this.getWorkflow(id, accountId)
    const deleted = await this.repositories.definitions.delete(id)
    if (!deleted) {
      throw new HttpError(404, 'WORKFLOW_NOT_FOUND', 'Workflow not found.')
    }
  }

  async getNodeTasks(workflowId: string, nodeId: string, accountId: string): Promise<WorkflowNodeTaskHistoryItem[]> {
    await this.getWorkflow(workflowId, accountId)
    const links = await this.repositories.nodeTasks.listNodeTaskLinks(workflowId, nodeId)
    const hydrated = await Promise.all(
      links.map(async (link) => ({
        workflowRunId: link.workflowRunId,
        nodeId: link.nodeId,
        task: await this.workflowRunsService.getTask(accountId, link.taskId),
      })),
    )
    return hydrated.sort((left, right) => right.task.createdAt.localeCompare(left.task.createdAt))
  }

  async getRun(runId: string, accountId: string): Promise<WorkflowRun> {
    const run = await this.workflowRunsService.getRun(runId)
    this.assertAccountAccess(run.accountId, accountId)
    return run
  }

  async getWorkflow(id: string, accountId: string): Promise<Workflow> {
    const workflow = await this.repositories.definitions.findById(id)
    if (!workflow) {
      throw new HttpError(404, 'WORKFLOW_NOT_FOUND', 'Workflow not found.')
    }
    this.assertAccountAccess(workflow.accountId, accountId)
    return workflow
  }

  async listRuns(workflowId: string, accountId: string): Promise<WorkflowRun[]> {
    await this.getWorkflow(workflowId, accountId)
    return this.workflowRunsService.listRuns(workflowId)
  }

  async listWorkflows(accountId: string): Promise<Workflow[]> {
    return this.repositories.definitions.list(accountId)
  }

  async checkpointWorkflow(
    id: string,
    input: {
      edges: WorkflowCanvasEdge[]
      name?: string | undefined
      nodes: WorkflowCanvasNode[]
    },
    accountId: string,
  ): Promise<Workflow> {
    const current = await this.getWorkflow(id, accountId)
    const nodes = cloneNodes(input.nodes)
    const edges = cloneEdges(input.edges)
    validateCanvas(nodes, edges)
    const timestamp = nowIso()
    const workflow = await this.repositories.definitions.replaceDefinition({
      id,
      name: input.name ?? current.name,
      nodes,
      edges,
      version: current.version + 1,
      timestamp,
    })
    this.publishWorkflowEvent({
      id: createWorkflowEventId(),
      accountId: workflow.accountId,
      createdAt: timestamp,
      payload: {
        changedEdgeIds: edges.map((edge) => edge.id),
        changedNodeIds: nodes.map((node) => node.id),
      },
      type: 'workflow.definition.updated',
      version: workflow.version,
      workflowId: workflow.id,
    })
    return workflow
  }

  async createRun(workflowId: string, input: CreateWorkflowRunInput, accountId: string): Promise<WorkflowRun> {
    await this.getWorkflow(workflowId, accountId)
    const run = await this.workflowRunsService.createRun(workflowId, input, accountId)
    this.publishWorkflowEvent({
      id: createWorkflowEventId(),
      accountId: run.accountId,
      createdAt: run.updatedAt,
      payload: { runId: run.id, status: run.status },
      type: 'workflow.run.updated',
      version: run.workflowVersion,
      workflowId: run.workflowId,
    })
    for (const [nodeId, state] of Object.entries(run.nodeStates)) {
      if (state.taskId) {
        this.publishWorkflowEvent({
          id: createWorkflowEventId(),
          accountId: run.accountId,
          createdAt: run.updatedAt,
          payload: { nodeId, taskId: state.taskId, status: 'queued' },
          type: 'workflow.node.task.updated',
          version: run.workflowVersion,
          workflowId: run.workflowId,
        })
      }
    }
    return run
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

  private publishWorkflowEvent(event: WorkflowEvent): void {
    this.workflowEventBus?.publish(event)
  }

  private assertAccountAccess(resourceAccountId: string, expectedAccountId: string): void {
    if (resourceAccountId !== expectedAccountId) {
      throw new HttpError(404, 'WORKFLOW_NOT_FOUND', 'Workflow not found.')
    }
  }
}
