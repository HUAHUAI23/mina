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
import type { WorkflowDefinitionRepository } from './repositories/workflow-definition.repository'
import type { WorkflowNodeTaskLink, WorkflowNodeTaskRepository } from './repositories/workflow-node-task.repository'
import type { WorkflowRunRepository } from './repositories/workflow-run.repository'
import type { WorkflowRunNodeStateRepository } from './repositories/workflow-run-node-state.repository'
import { validateCanvas } from './validation'
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
  ) {
    this.workflowRunsService = new WorkflowRunsService(
      repositories,
      tasksService,
      taskConfigAssembler,
      workflowMediaResolver,
      workflowRunEventLog,
    )
  }

  async createWorkflow(input: CreateWorkflowInput, accountId = DEFAULT_ACCOUNT_ID): Promise<Workflow> {
    const timestamp = nowIso()
    const nodes = cloneNodes(input.nodes)
    const edges = cloneEdges(input.edges)
    validateCanvas(nodes, edges)
    return this.repositories.definitions.create({
      id: createId('workflow'),
      accountId,
      name: input.name,
      version: 1,
      nodes,
      edges,
      timestamp,
    })
  }

  async deleteWorkflow(id: string): Promise<void> {
    const deleted = await this.repositories.definitions.delete(id)
    if (!deleted) {
      throw new HttpError(404, 'WORKFLOW_NOT_FOUND', 'Workflow not found.')
    }
  }

  async getNodeTasks(workflowId: string, nodeId: string): Promise<WorkflowNodeTaskLink[]> {
    await this.getWorkflow(workflowId)
    return this.repositories.nodeTasks.listNodeTaskLinks(workflowId, nodeId)
  }

  async getRun(runId: string): Promise<WorkflowRun> {
    return this.workflowRunsService.getRun(runId)
  }

  async getWorkflow(id: string): Promise<Workflow> {
    const workflow = await this.repositories.definitions.findById(id)
    if (!workflow) {
      throw new HttpError(404, 'WORKFLOW_NOT_FOUND', 'Workflow not found.')
    }
    return workflow
  }

  async listRuns(workflowId?: string): Promise<WorkflowRun[]> {
    return this.workflowRunsService.listRuns(workflowId)
  }

  async listWorkflows(accountId = DEFAULT_ACCOUNT_ID): Promise<Workflow[]> {
    return this.repositories.definitions.list(accountId)
  }

  async updateNodeMediaView(
    workflowId: string,
    nodeId: string,
    input: UpdateNodeMediaViewInput,
  ): Promise<Workflow> {
    await this.getWorkflow(workflowId)
    return this.repositories.definitions.updateNodeMediaView({
      workflowId,
      nodeId,
      mediaView: input.mediaView,
      timestamp: nowIso(),
    })
  }

  async updateWorkflow(id: string, input: UpdateWorkflowInput): Promise<Workflow> {
    const current = await this.getWorkflow(id)
    if (current.version !== input.version) {
      throw new HttpError(409, 'WORKFLOW_VERSION_CONFLICT', 'Workflow version is stale.')
    }

    const nodes = cloneNodes(input.nodes)
    const edges = cloneEdges(input.edges)
    validateCanvas(nodes, edges)
    return this.repositories.definitions.replaceDefinition({
      id,
      name: input.name ?? current.name,
      nodes,
      edges,
      version: current.version + 1,
      timestamp: nowIso(),
    })
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
