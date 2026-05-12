import type {
  CreateWorkflowInput,
  CreateWorkflowRunInput,
  MediaInput,
  MediaSlotConnection,
  NodeExecutionOutput,
  NodeMediaViewState,
  NodeOutputResource,
  ResourceKind,
  ResourceRef,
  ResourceRole,
  TaskConfig,
  UpdateNodeMediaViewInput,
  UpdateWorkflowInput,
  VideoGenerationConfig,
  Workflow,
  WorkflowCanvasEdge,
  WorkflowCanvasNode,
  WorkflowRun,
  WorkflowRunNodeState,
} from '@mina/contracts'

import { HttpError } from '../../lib/http/http-error'
import type { TasksService } from '../tasks/tasks.service'
import type { WorkflowNodeTaskLink, WorkflowRepository } from './workflows.repository'

const DEFAULT_ACCOUNT_ID = 'demo-account'

const nowIso = (): string => new Date().toISOString()

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`

const isExecutableNode = (node: WorkflowCanvasNode): boolean =>
  node.data.nodeType === 'image_generation' || node.data.nodeType === 'video_generation'

const isGroupNode = (node: WorkflowCanvasNode): boolean =>
  node.data.nodeType === 'flow_group' || node.data.nodeType === 'node_group'

type MediaWorkflowNode = WorkflowCanvasNode & {
  data: {
    nodeType: 'image_generation' | 'video_generation'
    mediaView?: NodeMediaViewState
  }
}

const isMediaWorkflowNode = (node: WorkflowCanvasNode): node is MediaWorkflowNode =>
  node.data.nodeType === 'image_generation' || node.data.nodeType === 'video_generation'

const isNodeOutputResource = (resource: NodeOutputResource | ResourceRef): resource is NodeOutputResource =>
  typeof resource.id === 'string' && typeof resource.index === 'number' && resource.role !== undefined

const cloneNodes = (nodes: WorkflowCanvasNode[]): WorkflowCanvasNode[] => structuredClone(nodes)
const cloneEdges = (edges: WorkflowCanvasEdge[]): WorkflowCanvasEdge[] => structuredClone(edges)

const slotToInputRole = (slot: MediaSlotConnection['targetSlot']): ResourceRole => {
  if (slot === 'firstFrame') return 'first_frame'
  if (slot === 'lastFrame') return 'last_frame'
  if (slot === 'referenceAudios') return 'reference_audio'
  if (slot === 'referenceVideos') return 'reference_video'
  return 'reference_image'
}

const slotToResourceKind = (slot: MediaSlotConnection['targetSlot']): ResourceKind | undefined => {
  if (slot === 'referenceAudios') return 'audio'
  if (slot === 'referenceVideos') return 'video'
  if (slot === 'prompt') return undefined
  return 'image'
}

const mediaInputFromOutput = (
  resource: NodeOutputResource,
  role: ResourceRole,
  source: MediaInput['source'],
): MediaInput => ({
  kind: resource.kind,
  url: resource.url,
  role,
  source,
  ...(resource.metadata ? { metadata: resource.metadata } : {}),
})

const mediaInputFromResourceRef = (resource: ResourceRef, role: ResourceRole): MediaInput => ({
  kind: resource.kind,
  url: resource.url,
  role,
  ...(resource.metadata ? { metadata: resource.metadata } : {}),
})

const getNodeMap = (nodes: WorkflowCanvasNode[]): Map<string, WorkflowCanvasNode> =>
  new Map(nodes.map((node) => [node.id, node]))

const getIncomingEdges = (nodeId: string, edges: WorkflowCanvasEdge[]): WorkflowCanvasEdge[] =>
  edges.filter((edge) => edge.target === nodeId)

const getOutgoingEdges = (nodeId: string, edges: WorkflowCanvasEdge[]): WorkflowCanvasEdge[] =>
  edges.filter((edge) => edge.source === nodeId)

const isDescendantOf = (
  nodeId: string,
  ancestorId: string,
  nodeMap: Map<string, WorkflowCanvasNode>,
): boolean => {
  let current = nodeMap.get(nodeId)
  while (current?.parentId) {
    if (current.parentId === ancestorId) {
      return true
    }
    current = nodeMap.get(current.parentId)
  }
  return false
}

const findNearestFlowGroupId = (
  nodeId: string,
  nodeMap: Map<string, WorkflowCanvasNode>,
): string | undefined => {
  let current = nodeMap.get(nodeId)
  while (current?.parentId) {
    const parent = nodeMap.get(current.parentId)
    if (!parent) {
      return undefined
    }
    if (parent.data.nodeType === 'flow_group') {
      return parent.id
    }
    current = parent
  }
  return undefined
}

const sortNodesForExecution = (nodes: WorkflowCanvasNode[]): WorkflowCanvasNode[] =>
  [...nodes].sort((left, right) => {
    const yDiff = left.position.y - right.position.y
    if (yDiff !== 0) return yDiff
    const xDiff = left.position.x - right.position.x
    if (xDiff !== 0) return xDiff
    return left.id.localeCompare(right.id)
  })

const findOutputBySelector = (
  output: NodeExecutionOutput,
  resourceKind: ResourceKind,
  role: ResourceRole,
  index: number,
): NodeOutputResource | undefined =>
  output.resources.find(
    (resource) => resource.kind === resourceKind && resource.role === role && resource.index === index,
  )

const findOutputByMediaView = (
  output: NodeExecutionOutput,
  outputResourceId: string | undefined,
  outputIndex: number | undefined,
): NodeOutputResource | undefined => {
  if (outputResourceId) {
    const byId = output.resources.find((resource) => resource.id === outputResourceId)
    if (byId) {
      return byId
    }
  }

  if (outputIndex !== undefined) {
    return output.resources[outputIndex]
  }

  return output.resources[0]
}

const buildImageTaskConfig = (
  baseConfig: TaskConfig,
  inputs: MediaInput[],
): TaskConfig => {
  if (baseConfig.kind !== 'image_generation') {
    throw new Error('Node task config is not an image generation config.')
  }

  if (inputs.length === 0) {
    return baseConfig
  }

  return {
    kind: 'image_generation',
    mode: 'image_to_image',
    provider: baseConfig.provider,
    model: baseConfig.model,
    prompt: baseConfig.prompt,
    size: baseConfig.size,
    count: baseConfig.count,
    inputImages: [...(baseConfig.mode === 'image_to_image' ? baseConfig.inputImages : []), ...inputs],
  }
}

const buildVideoTaskConfig = (
  baseConfig: VideoGenerationConfig,
  inputsBySlot: Partial<Record<MediaSlotConnection['targetSlot'], MediaInput[]>>,
): VideoGenerationConfig => ({
  ...baseConfig,
  ...(inputsBySlot.firstFrame?.[0] ? { firstFrame: inputsBySlot.firstFrame[0] } : {}),
  ...(inputsBySlot.lastFrame?.[0] ? { lastFrame: inputsBySlot.lastFrame[0] } : {}),
  referenceImages: [...baseConfig.referenceImages, ...(inputsBySlot.referenceImages ?? [])],
  referenceAudios: [...baseConfig.referenceAudios, ...(inputsBySlot.referenceAudios ?? [])],
  referenceVideos: [...baseConfig.referenceVideos, ...(inputsBySlot.referenceVideos ?? [])],
})

interface ResolvedMediaInput {
  input: MediaInput
  targetSlot: MediaSlotConnection['targetSlot']
}

interface ExecuteNodeResult {
  run: WorkflowRun
  progressed: boolean
}

export class WorkflowsService {
  constructor(
    private readonly workflowRepository: WorkflowRepository,
    private readonly tasksService: TasksService,
  ) {}

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

    this.validateCanvas(workflow.nodes, workflow.edges)
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
    const run = await this.workflowRepository.findRunById(runId)
    if (!run) {
      throw new HttpError(404, 'WORKFLOW_RUN_NOT_FOUND', 'Workflow run not found.')
    }
    return run
  }

  async getWorkflow(id: string): Promise<Workflow> {
    const workflow = await this.workflowRepository.findById(id)
    if (!workflow) {
      throw new HttpError(404, 'WORKFLOW_NOT_FOUND', 'Workflow not found.')
    }
    return workflow
  }

  async listRuns(workflowId?: string): Promise<WorkflowRun[]> {
    return this.workflowRepository.listRuns(workflowId)
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

    this.validateCanvas(updated.nodes, updated.edges)
    return this.workflowRepository.update(updated)
  }

  async createRun(workflowId: string, input: CreateWorkflowRunInput): Promise<WorkflowRun> {
    const workflow = await this.getWorkflow(workflowId)
    if (workflow.version !== input.expectedWorkflowVersion) {
      throw new HttpError(409, 'WORKFLOW_VERSION_CONFLICT', 'Workflow version is stale.')
    }

    const nodeMap = getNodeMap(workflow.nodes)
    const selectedNode = nodeMap.get(input.selectedNodeId)
    if (!selectedNode) {
      throw new HttpError(404, 'WORKFLOW_NODE_NOT_FOUND', 'Selected workflow node not found.')
    }
    if (!isExecutableNode(selectedNode)) {
      throw new HttpError(422, 'WORKFLOW_NODE_NOT_EXECUTABLE', 'Selected workflow node is not executable.')
    }

    const scopeGroupNodeId = findNearestFlowGroupId(selectedNode.id, nodeMap)
    if (scopeGroupNodeId) {
      this.validateFlowGroup(workflow.nodes, workflow.edges, scopeGroupNodeId)
    } else {
      await this.preflightIsolatedNode(workflow, selectedNode)
    }

    const timestamp = nowIso()
    const run: WorkflowRun = {
      id: createId('workflow_run'),
      workflowId: workflow.id,
      accountId: workflow.accountId,
      workflowVersion: workflow.version,
      runMode: scopeGroupNodeId ? 'flow_group' : 'isolated_node',
      selectedNodeId: selectedNode.id,
      ...(scopeGroupNodeId ? { scopeGroupNodeId } : {}),
      snapshotNodes: cloneNodes(workflow.nodes),
      snapshotEdges: cloneEdges(workflow.edges),
      nodeStates: this.createInitialNodeStates(workflow.nodes, selectedNode.id, scopeGroupNodeId),
      status: 'running',
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: timestamp,
    }

    const created = await this.workflowRepository.createRun(run)
    return this.reconcileRun(created.id)
  }

  async cancelRun(runId: string): Promise<void> {
    const run = await this.getRun(runId)
    if (run.status !== 'running' && run.status !== 'queued') {
      throw new HttpError(409, 'WORKFLOW_RUN_NOT_CANCELLABLE', 'Only queued or running workflow runs can be cancelled.')
    }

    await this.workflowRepository.updateRun({
      ...run,
      status: 'cancelled',
      completedAt: nowIso(),
      updatedAt: nowIso(),
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
      const result = await this.executeNode(run, node)
      run = result.run
      return this.finishRunIfSettled(run)
    }

    return this.reconcileFlowGroupRun(run)
  }

  private createInitialNodeStates(
    nodes: WorkflowCanvasNode[],
    selectedNodeId: string,
    scopeGroupNodeId: string | undefined,
  ): Record<string, WorkflowRunNodeState> {
    if (!scopeGroupNodeId) {
      return {
        [selectedNodeId]: {
          status: 'pending',
        },
      }
    }

    const nodeMap = getNodeMap(nodes)
    return Object.fromEntries(
      nodes
        .filter((node) => isExecutableNode(node) && isDescendantOf(node.id, scopeGroupNodeId, nodeMap))
        .map((node) => [node.id, { status: 'pending' as const }]),
    )
  }

  private async executeNode(run: WorkflowRun, node: WorkflowCanvasNode): Promise<ExecuteNodeResult> {
    const currentState = run.nodeStates[node.id]
    if (currentState?.status === 'succeeded') {
      return { run, progressed: false }
    }

    if (currentState?.status === 'running' && currentState.taskId) {
      const task = await this.tasksService.getTask(currentState.taskId)
      if (task.status === 'succeeded' && task.output) {
        const nextRun = await this.workflowRepository.updateRunNodeState(run.id, node.id, {
          ...currentState,
          status: 'succeeded',
          output: task.output,
          completedAt: nowIso(),
        })
        return { run: nextRun, progressed: true }
      }

      if (task.status === 'failed' || task.status === 'cancelled') {
        const failedRun = await this.failRun(run, `Task ${task.id} ended with status ${task.status}.`, node.id)
        return { run: failedRun, progressed: true }
      }

      return { run, progressed: false }
    }

    try {
      const taskConfig = await this.buildTaskConfigForNode(run, node)
      const inputResources = this.collectInputResources(taskConfig)
      const task = await this.tasksService.createTask({
        accountId: run.accountId,
        config: taskConfig,
        inputResources,
      })
      await this.workflowRepository.linkNodeTask({
        workflowRunId: run.id,
        nodeId: node.id,
        taskId: task.id,
      })

      let nextRun = await this.workflowRepository.updateRunNodeState(run.id, node.id, {
        status: 'running',
        taskId: task.id,
        startedAt: nowIso(),
      })
      const executed = await this.tasksService.runTask(task.id)

      if (executed.status === 'succeeded' && executed.output) {
        nextRun = await this.workflowRepository.updateRunNodeState(run.id, node.id, {
          status: 'succeeded',
          taskId: executed.id,
          output: executed.output,
          startedAt: nextRun.nodeStates[node.id]?.startedAt,
          completedAt: nowIso(),
        })
      }

      return { run: nextRun, progressed: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Workflow node execution failed.'
      const failedRun = await this.failRun(run, message, node.id)
      return { run: failedRun, progressed: true }
    }
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
          const result = await this.executeNode(run, node)
          run = result.run
          progressed = progressed || result.progressed
          continue
        }

        const predecessors = this.getExecutablePredecessors(node.id, scopedEdges, nodeMap)
        const allPredecessorsSucceeded = predecessors.every(
          (predecessor) => run.nodeStates[predecessor.id]?.status === 'succeeded',
        )

        if (!allPredecessorsSucceeded) {
          continue
        }

        const result = await this.executeNode(run, node)
        run = result.run
        progressed = progressed || result.progressed
      }
    }

    return this.finishRunIfSettled(run)
  }

  private getExecutablePredecessors(
    nodeId: string,
    edges: WorkflowCanvasEdge[],
    nodeMap: Map<string, WorkflowCanvasNode>,
  ): WorkflowCanvasNode[] {
    return edges
      .filter((edge) => edge.target === nodeId)
      .map((edge) => nodeMap.get(edge.source))
      .filter((node): node is WorkflowCanvasNode => node !== undefined && isExecutableNode(node))
  }

  private async buildTaskConfigForNode(run: WorkflowRun, node: WorkflowCanvasNode): Promise<TaskConfig> {
    if (node.data.nodeType !== 'image_generation' && node.data.nodeType !== 'video_generation') {
      throw new Error('Node is not executable.')
    }
    if (!node.data.config.task) {
      throw new Error('Executable node is missing task config.')
    }

    const inputs = await this.resolveIncomingMediaInputs(run, node)
    if (node.data.nodeType === 'image_generation') {
      return buildImageTaskConfig(
        node.data.config.task,
        inputs.filter((item) => item.targetSlot === 'inputImages').map((item) => item.input),
      )
    }

    if (node.data.config.task.kind !== 'video_generation') {
      throw new Error('Video node task config is invalid.')
    }

    const inputsBySlot = inputs.reduce<Partial<Record<MediaSlotConnection['targetSlot'], MediaInput[]>>>(
      (accumulator, item) => ({
        ...accumulator,
        [item.targetSlot]: [...(accumulator[item.targetSlot] ?? []), item.input],
      }),
      {},
    )
    return buildVideoTaskConfig(node.data.config.task, inputsBySlot)
  }

  private collectInputResources(config: TaskConfig): MediaInput[] {
    if (config.kind === 'image_generation') {
      return config.mode === 'image_to_image' ? config.inputImages : []
    }

    return [
      config.firstFrame,
      config.lastFrame,
      ...config.referenceImages,
      ...config.referenceAudios,
      ...config.referenceVideos,
    ].filter((input): input is MediaInput => input !== undefined)
  }

  private async resolveIncomingMediaInputs(run: WorkflowRun, node: WorkflowCanvasNode): Promise<ResolvedMediaInput[]> {
    const incomingEdges = getIncomingEdges(node.id, run.snapshotEdges)
    const inputs: ResolvedMediaInput[] = []

    for (const edge of incomingEdges) {
      const resolved = await this.resolveEdgeMediaInput(run, edge)
      if (resolved) {
        inputs.push(resolved)
      }
    }

    return inputs
  }

  private async preflightIsolatedNode(workflow: Workflow, node: WorkflowCanvasNode): Promise<void> {
    const nodeMap = getNodeMap(workflow.nodes)
    for (const edge of getIncomingEdges(node.id, workflow.edges)) {
      const { connection } = edge.data
      if (!connection.required || connection.sourceSelector.mode === 'empty' || connection.targetSlot === 'prompt') {
        continue
      }

      if (connection.sourceSelector.mode === 'asset') {
        continue
      }

      if (connection.sourceSelector.mode !== 'current_media') {
        throw new HttpError(
          422,
          'WORKFLOW_ISOLATED_RUN_OUTPUT_SELECTOR',
          'Ordinary canvas execution requires current media selectors.',
        )
      }

      const sourceNode = nodeMap.get(edge.source)
      if (!sourceNode || !isMediaWorkflowNode(sourceNode) || !sourceNode.data.mediaView?.taskId) {
        throw new HttpError(422, 'WORKFLOW_UPSTREAM_OUTPUT_MISSING', 'Required upstream MediaView output is missing.')
      }

      const output = await this.tasksService.getTaskOutput(sourceNode.data.mediaView.taskId)
      const resource = output
        ? findOutputByMediaView(output, sourceNode.data.mediaView.outputResourceId, sourceNode.data.mediaView.outputIndex)
        : undefined
      const expectedKind = slotToResourceKind(connection.targetSlot)
      if (!resource) {
        throw new HttpError(422, 'WORKFLOW_UPSTREAM_OUTPUT_MISSING', 'Required upstream MediaView output is missing.')
      }
      if (expectedKind && resource.kind !== expectedKind) {
        throw new HttpError(422, 'WORKFLOW_UPSTREAM_OUTPUT_KIND_MISMATCH', 'Upstream output kind does not match target slot.')
      }
    }
  }

  private async resolveEdgeMediaInput(run: WorkflowRun, edge: WorkflowCanvasEdge): Promise<ResolvedMediaInput | null> {
    const { connection } = edge.data
    if (connection.sourceSelector.mode === 'empty') {
      return null
    }
    if (connection.targetSlot === 'prompt') {
      return null
    }

    const expectedKind = slotToResourceKind(connection.targetSlot)
    const inputRole = slotToInputRole(connection.targetSlot)
    let resource: NodeOutputResource | ResourceRef | undefined
    let source: MediaInput['source']

    if (connection.sourceSelector.mode === 'asset') {
      resource = connection.sourceSelector.resource
    } else if (connection.sourceSelector.mode === 'run_output') {
      const sourceState = run.nodeStates[edge.source]
      resource = sourceState?.output
        ? findOutputBySelector(
            sourceState.output,
            connection.sourceSelector.resourceKind,
            connection.sourceSelector.role,
            connection.sourceSelector.index,
          )
        : undefined
      source = {
        workflowId: run.workflowId,
        workflowRunId: run.id,
        nodeId: edge.source,
        ...(sourceState?.taskId ? { taskId: sourceState.taskId } : {}),
        ...(resource?.id ? { outputResourceId: resource.id } : {}),
        ...(resource?.index !== undefined ? { outputIndex: resource.index } : {}),
      }
    } else {
      const sourceNode = getNodeMap(run.snapshotNodes).get(edge.source)
      if (!sourceNode || !isMediaWorkflowNode(sourceNode) || !sourceNode.data.mediaView?.taskId) {
        return this.handleMissingMedia(connection, 'Source node has no current MediaView output.')
      }

      const output = await this.tasksService.getTaskOutput(sourceNode.data.mediaView.taskId)
      resource = output
        ? findOutputByMediaView(output, sourceNode.data.mediaView.outputResourceId, sourceNode.data.mediaView.outputIndex)
        : undefined
      source = {
        workflowId: run.workflowId,
        nodeId: edge.source,
        taskId: sourceNode.data.mediaView.taskId,
        ...(resource?.id ? { outputResourceId: resource.id } : {}),
        ...(resource?.index !== undefined ? { outputIndex: resource.index } : {}),
      }
    }

    if (!resource) {
      return this.handleMissingMedia(connection, 'Required upstream output is missing.')
    }
    if (expectedKind && resource.kind !== expectedKind) {
      throw new Error(`Upstream output kind "${resource.kind}" cannot be used for slot "${connection.targetSlot}".`)
    }

    return {
      targetSlot: connection.targetSlot,
      input:
        isNodeOutputResource(resource)
          ? mediaInputFromOutput(resource, inputRole, source)
          : mediaInputFromResourceRef(resource, inputRole),
    }
  }

  private handleMissingMedia(connection: MediaSlotConnection, message: string): null {
    if (!connection.required) {
      return null
    }
    throw new Error(message)
  }

  private async finishRunIfSettled(run: WorkflowRun): Promise<WorkflowRun> {
    if (run.status !== 'running') {
      return run
    }

    const states = Object.values(run.nodeStates)
    if (states.length > 0 && states.every((state) => state.status === 'succeeded' || state.status === 'skipped')) {
      return this.workflowRepository.updateRun({
        ...run,
        status: 'succeeded',
        completedAt: nowIso(),
        updatedAt: nowIso(),
      })
    }

    if (states.some((state) => state.status === 'failed')) {
      return this.workflowRepository.updateRun({
        ...run,
        status: 'failed',
        completedAt: nowIso(),
        updatedAt: nowIso(),
      })
    }

    return run
  }

  private async failRun(run: WorkflowRun, message: string, nodeId?: string): Promise<WorkflowRun> {
    const failedAt = nowIso()
    const failedNodeStates =
      nodeId && run.nodeStates[nodeId]
        ? {
            ...run.nodeStates,
            [nodeId]: {
              ...run.nodeStates[nodeId],
              status: 'failed' as const,
              error: message,
              completedAt: failedAt,
            },
          }
        : run.nodeStates

    return this.workflowRepository.updateRun({
      ...run,
      nodeStates: failedNodeStates,
      status: 'failed',
      error: message,
      completedAt: failedAt,
      updatedAt: failedAt,
    })
  }

  private validateCanvas(nodes: WorkflowCanvasNode[], edges: WorkflowCanvasEdge[]): void {
    const nodeMap = getNodeMap(nodes)
    for (const node of nodes) {
      if (node.type !== node.data.nodeType) {
        throw new HttpError(422, 'WORKFLOW_NODE_TYPE_MISMATCH', 'Workflow node type must match node data type.')
      }
      if (node.parentId) {
        const parent = nodeMap.get(node.parentId)
        if (!parent || !isGroupNode(parent)) {
          throw new HttpError(422, 'WORKFLOW_PARENT_NOT_FOUND', 'Workflow node parent must be a group node.')
        }
      }
    }

    for (const edge of edges) {
      if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
        throw new HttpError(422, 'WORKFLOW_EDGE_NODE_NOT_FOUND', 'Workflow edge source and target must exist.')
      }
    }
  }

  private validateFlowGroup(nodes: WorkflowCanvasNode[], edges: WorkflowCanvasEdge[], scopeGroupNodeId: string): void {
    const nodeMap = getNodeMap(nodes)
    const scopedNodeIds = new Set(
      nodes.filter((node) => isDescendantOf(node.id, scopeGroupNodeId, nodeMap)).map((node) => node.id),
    )

    for (const edge of edges) {
      const sourceInScope = scopedNodeIds.has(edge.source)
      const targetInScope = scopedNodeIds.has(edge.target)
      if (sourceInScope !== targetInScope) {
        throw new HttpError(422, 'WORKFLOW_CROSS_FLOW_EDGE', 'Flow group execution does not support cross-scope edges.')
      }
    }

    const executableIds = new Set(
      nodes
        .filter((node) => isExecutableNode(node) && scopedNodeIds.has(node.id))
        .map((node) => node.id),
    )
    const executableEdges = edges.filter((edge) => executableIds.has(edge.source) && executableIds.has(edge.target))
    const inDegree = new Map(Array.from(executableIds).map((id) => [id, 0]))
    for (const edge of executableEdges) {
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
    }

    const ready = Array.from(inDegree.entries())
      .filter((entry) => entry[1] === 0)
      .map((entry) => entry[0])
    let visited = 0
    while (ready.length > 0) {
      const current = ready.shift()
      if (!current) {
        continue
      }
      visited += 1
      for (const edge of getOutgoingEdges(current, executableEdges)) {
        const nextDegree = (inDegree.get(edge.target) ?? 0) - 1
        inDegree.set(edge.target, nextDegree)
        if (nextDegree === 0) {
          ready.push(edge.target)
        }
      }
    }

    if (visited !== executableIds.size) {
      throw new HttpError(422, 'WORKFLOW_FLOW_CYCLE', 'Flow group execution graph must be acyclic.')
    }
  }
}
