import type {
  CreateWorkflowInput,
  CreateWorkflowRunInput,
  UpdateNodeMediaViewInput,
  UpdateWorkflowInput,
  Workflow,
  WorkflowRun,
} from '@mina/contracts/modules/workflows'
import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import { HttpError } from '../../lib/http/http-error'
import { DEFAULT_ACCOUNT_ID } from '../accounts/accounts.data'
import type { TaskConfigAssembler } from '../tasks/config/task-config-assembler'
import type { TasksService } from '../tasks/tasks.service'
import type { WorkflowMediaResolver } from './media/workflow-media-resolver'
import { validateCanvas } from './validation'
import { NoopWorkflowRunEventLog, type WorkflowRunEventLog } from './workflow-events'
import { WorkflowRunsService } from './workflow-runs.service'
import type { WorkflowNodeTaskLink, WorkflowRepository } from './workflows.repository'

const nowIso = (): string => new Date().toISOString()

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`

const cloneNodes = (nodes: WorkflowCanvasNode[]): WorkflowCanvasNode[] => structuredClone(nodes)
const cloneEdges = (edges: WorkflowCanvasEdge[]): WorkflowCanvasEdge[] => structuredClone(edges)

export class WorkflowsService {
  private readonly workflowRunsService: WorkflowRunsService

  constructor(
    private readonly workflowRepository: WorkflowRepository,
    tasksService: TasksService,
    taskConfigAssembler: TaskConfigAssembler,
    workflowMediaResolver: WorkflowMediaResolver,
    workflowRunEventLog: WorkflowRunEventLog = new NoopWorkflowRunEventLog(),
  ) {
    this.workflowRunsService = new WorkflowRunsService(
      workflowRepository,
      tasksService,
      taskConfigAssembler,
      workflowMediaResolver,
      workflowRunEventLog,
    )
  }

  async createWorkflow(input: CreateWorkflowInput, accountId = DEFAULT_ACCOUNT_ID): Promise<Workflow> {
    const timestamp = nowIso()
    const workflow: Workflow = {
      id: createId('workflow'),
      accountId,
      name: input.name,
      version: 1,
      nodes: cloneNodes(input.nodes),
      edges: cloneEdges(input.edges),
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    validateCanvas(workflow.nodes, workflow.edges)
    return this.workflowRepository.create(workflow)
  }

  async deleteWorkflow(id: string): Promise<void> {
    const deleted = await this.workflowRepository.delete(id)
    if (!deleted) {
      throw new HttpError(404, 'WORKFLOW_NOT_FOUND', 'Workflow not found.')
    }
  }

  async getNodeTasks(workflowId: string, nodeId: string): Promise<WorkflowNodeTaskLink[]> {
    await this.getWorkflow(workflowId)
    return this.workflowRepository.listNodeTaskLinks(workflowId, nodeId)
  }

  async getRun(runId: string): Promise<WorkflowRun> {
    return this.workflowRunsService.getRun(runId)
  }

  async getWorkflow(id: string): Promise<Workflow> {
    const workflow = await this.workflowRepository.findById(id)
    if (!workflow) {
      throw new HttpError(404, 'WORKFLOW_NOT_FOUND', 'Workflow not found.')
    }
    return workflow
  }

  async listRuns(workflowId?: string): Promise<WorkflowRun[]> {
    return this.workflowRunsService.listRuns(workflowId)
  }

  async listWorkflows(accountId = DEFAULT_ACCOUNT_ID): Promise<Workflow[]> {
    return this.workflowRepository.list(accountId)
  }

  async updateNodeMediaView(
    workflowId: string,
    nodeId: string,
    input: UpdateNodeMediaViewInput,
  ): Promise<Workflow> {
    await this.getWorkflow(workflowId)
    return this.workflowRepository.updateNodeMediaView(workflowId, nodeId, input.mediaView)
  }

  async updateWorkflow(id: string, input: UpdateWorkflowInput): Promise<Workflow> {
    const current = await this.getWorkflow(id)
    if (current.version !== input.version) {
      throw new HttpError(409, 'WORKFLOW_VERSION_CONFLICT', 'Workflow version is stale.')
    }

    const updated: Workflow = {
      ...current,
      name: input.name ?? current.name,
      nodes: cloneNodes(input.nodes),
      edges: cloneEdges(input.edges),
      version: current.version + 1,
      updatedAt: nowIso(),
    }

    validateCanvas(updated.nodes, updated.edges)
    return this.workflowRepository.update(updated)
  }

  async createRun(workflowId: string, input: CreateWorkflowRunInput): Promise<WorkflowRun> {
    return this.workflowRunsService.createRun(workflowId, input)
  }

  async cancelRun(runId: string): Promise<void> {
    await this.workflowRunsService.cancelRun(runId)
  }

  async reconcileRunningRuns(): Promise<WorkflowRun[]> {
    return this.workflowRunsService.reconcileRunningRuns()
  }

  async reconcileRun(runId: string): Promise<WorkflowRun> {
    return this.workflowRunsService.reconcileRun(runId)
  }
}
