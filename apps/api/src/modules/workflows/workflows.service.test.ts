import { describe, expect, test } from 'bun:test'
import type {
  MediaSlotConnection,
  WorkflowCanvasEdge,
  WorkflowCanvasNode,
} from '@mina/contracts'

import { InMemoryPricingRepository } from '../pricing/pricing.repository'
import { PricingService } from '../pricing/pricing.service'
import { DevTaskProvider, type TaskProvider } from '../tasks/tasks.provider'
import { InMemoryTaskRepository } from '../tasks/tasks.repository'
import { TasksService } from '../tasks/tasks.service'
import { InMemoryWorkflowRunEventLog } from './workflow-events'
import { InMemoryWorkflowRepository } from './workflows.repository'
import { WorkflowsService } from './workflows.service'

const createServices = () => {
  const taskRepository = new InMemoryTaskRepository()
  const workflowRunEventLog = new InMemoryWorkflowRunEventLog()
  const tasksService = new TasksService(
    taskRepository,
    new PricingService(new InMemoryPricingRepository()),
    new DevTaskProvider(),
  )
  const workflowsService = new WorkflowsService(new InMemoryWorkflowRepository(), tasksService, workflowRunEventLog)

  return {
    taskRepository,
    tasksService,
    workflowRunEventLog,
    workflowsService,
  }
}

const runBackgroundCycle = async (services: Pick<ReturnType<typeof createServices>, 'tasksService' | 'workflowsService'>) => {
  await services.tasksService.startQueuedTasks()
  await services.tasksService.pollAsyncTasks()
  return services.workflowsService.reconcileRunningRuns()
}

const imageNode = (id: string, count: number, parentId?: string): WorkflowCanvasNode => ({
  id,
  type: 'image_generation',
  position: { x: 0, y: 0 },
  ...(parentId ? { parentId, extent: 'parent' as const } : {}),
  data: {
    nodeType: 'image_generation',
    title: id,
    config: {
      task: {
        kind: 'image_generation',
        mode: 'text_to_image',
        provider: 'dev',
        model: 'dev-image',
        prompt: `prompt ${id}`,
        size: '1024x1024',
        count,
      },
    },
  },
})

const videoNode = (id: string, parentId?: string): WorkflowCanvasNode => ({
  id,
  type: 'video_generation',
  position: { x: 300, y: 0 },
  ...(parentId ? { parentId, extent: 'parent' as const } : {}),
  data: {
    nodeType: 'video_generation',
    title: id,
    config: {
      task: {
        kind: 'video_generation',
        provider: 'dev',
        model: 'dev-video',
        prompt: `prompt ${id}`,
        resolution: '1080p',
        durationSeconds: 5,
        referenceImages: [],
        referenceAudios: [],
        referenceVideos: [],
        outputLastFrame: true,
      },
    },
  },
})

const flowGroupNode = (id: string): WorkflowCanvasNode => ({
  id,
  type: 'flow_group',
  position: { x: 0, y: 0 },
  width: 800,
  height: 400,
  data: {
    nodeType: 'flow_group',
    title: id,
    config: {},
  },
})

const mediaEdge = (
  id: string,
  source: string,
  target: string,
  targetSlot: MediaSlotConnection['targetSlot'],
  sourceSelector: MediaSlotConnection['sourceSelector'],
): WorkflowCanvasEdge => ({
  id,
  type: 'media',
  source,
  target,
  data: {
    connection: {
      kind: 'media_slot',
      targetSlot,
      required: true,
      sourceSelector,
    },
  },
})

describe('WorkflowsService execution semantics', () => {
  test('ordinary canvas uses the source node MediaView and does not run upstream nodes', async () => {
    const { taskRepository, tasksService, workflowsService } = createServices()
    const workflow = await workflowsService.createWorkflow({
      name: 'ordinary media view',
      nodes: [imageNode('a', 2), videoNode('b')],
      edges: [mediaEdge('a-b', 'a', 'b', 'firstFrame', { mode: 'current_media' })],
    })

    const sourceRun = await workflowsService.createRun(workflow.id, {
      selectedNodeId: 'a',
      expectedWorkflowVersion: workflow.version,
    })
    const sourceTaskId = sourceRun.nodeStates.a?.taskId
    expect(sourceRun.status).toBe('running')
    expect(typeof sourceTaskId).toBe('string')
    if (!sourceTaskId) {
      throw new Error('Source task id was not created.')
    }
    const [completedSourceRun] = await runBackgroundCycle({ tasksService, workflowsService })
    expect(completedSourceRun?.status).toBe('succeeded')

    const sourceTask = await tasksService.getTask(sourceTaskId)
    const selectedOutput = sourceTask.output?.resources[1]
    expect(selectedOutput?.role).toBe('generated_image')
    if (!selectedOutput) {
      throw new Error('Selected output was not created.')
    }

    const updatedWorkflow = await workflowsService.updateNodeMediaView(workflow.id, 'a', {
      mediaView: {
        taskId: sourceTask.id,
        outputResourceId: selectedOutput.id,
        outputIndex: 1,
      },
    })

    const targetRun = await workflowsService.createRun(updatedWorkflow.id, {
      selectedNodeId: 'b',
      expectedWorkflowVersion: updatedWorkflow.version,
    })
    const targetTaskId = targetRun.nodeStates.b?.taskId
    expect(targetRun.status).toBe('running')
    expect(typeof targetTaskId).toBe('string')
    if (!targetTaskId) {
      throw new Error('Target task id was not created.')
    }

    const sourceLinks = await workflowsService.getNodeTasks(workflow.id, 'a')
    expect(sourceLinks).toHaveLength(1)

    const inputResources = (await taskRepository.listResources(targetTaskId)).filter(
      (resource) => resource.direction === 'input',
    )
    expect(inputResources).toHaveLength(1)
    expect(inputResources[0]?.role).toBe('first_frame')
    expect(inputResources[0]?.url).toBe(selectedOutput?.url)
  })

  test('ordinary canvas rejects a required upstream slot without MediaView output', async () => {
    const { workflowsService } = createServices()
    const workflow = await workflowsService.createWorkflow({
      name: 'missing upstream',
      nodes: [imageNode('a', 1), videoNode('b')],
      edges: [mediaEdge('a-b', 'a', 'b', 'firstFrame', { mode: 'current_media' })],
    })

    await expect(
      workflowsService.createRun(workflow.id, {
        selectedNodeId: 'b',
        expectedWorkflowVersion: workflow.version,
      }),
    ).rejects.toMatchObject({
      code: 'WORKFLOW_UPSTREAM_OUTPUT_MISSING',
      status: 422,
    })
  })

  test('flow group executes all roots and resolves selected run outputs by role and index', async () => {
    const { taskRepository, tasksService, workflowsService } = createServices()
    const workflow = await workflowsService.createWorkflow({
      name: 'flow group',
      nodes: [
        flowGroupNode('group'),
        { ...imageNode('a', 2, 'group'), position: { x: 40, y: 80 } },
        { ...imageNode('c', 1, 'group'), position: { x: 40, y: 220 } },
        { ...videoNode('b', 'group'), position: { x: 420, y: 120 } },
      ],
      edges: [
        mediaEdge('a-b', 'a', 'b', 'firstFrame', {
          mode: 'run_output',
          resourceKind: 'image',
          role: 'generated_image',
          index: 1,
        }),
        mediaEdge('c-b', 'c', 'b', 'referenceImages', {
          mode: 'run_output',
          resourceKind: 'image',
          role: 'generated_image',
          index: 0,
        }),
      ],
    })

    const run = await workflowsService.createRun(workflow.id, {
      selectedNodeId: 'b',
      expectedWorkflowVersion: workflow.version,
    })
    expect(run.status).toBe('running')
    expect(run.nodeStates.a?.status).toBe('running')
    expect(run.nodeStates.c?.status).toBe('running')
    expect(run.nodeStates.b?.status).toBe('pending')

    const [rootCompletedRun] = await runBackgroundCycle({ tasksService, workflowsService })
    expect(rootCompletedRun?.status).toBe('running')
    expect(rootCompletedRun?.nodeStates.a?.status).toBe('succeeded')
    expect(rootCompletedRun?.nodeStates.c?.status).toBe('succeeded')
    expect(rootCompletedRun?.nodeStates.b?.status).toBe('running')

    const videoTaskId = rootCompletedRun?.nodeStates.b?.taskId
    expect(typeof videoTaskId).toBe('string')
    if (!videoTaskId) {
      throw new Error('Video task id was not created.')
    }
    const inputResources = (await taskRepository.listResources(videoTaskId)).filter(
      (resource) => resource.direction === 'input',
    )
    expect(inputResources.map((resource) => resource.role)).toEqual(['first_frame', 'reference_image'])

    const [completedRun] = await runBackgroundCycle({ tasksService, workflowsService })
    expect(completedRun?.status).toBe('succeeded')
    expect(completedRun?.nodeStates.b?.output?.resources.map((resource) => resource.role)).toEqual([
      'generated_video',
      'last_frame',
    ])
  })

  test('video duration pricing uses model and resolution rules', async () => {
    const { tasksService, workflowsService } = createServices()
    const workflow = await workflowsService.createWorkflow({
      name: 'pricing',
      nodes: [videoNode('video')],
      edges: [],
    })

    const run = await workflowsService.createRun(workflow.id, {
      selectedNodeId: 'video',
      expectedWorkflowVersion: workflow.version,
    })

    const taskId = run.nodeStates.video?.taskId
    expect(typeof taskId).toBe('string')
    if (!taskId) {
      throw new Error('Video task id was not created.')
    }
    const task = await tasksService.getTask(taskId)
    expect(task.cost.estimatedCost).toBe(50)
    const links = await workflowsService.getNodeTasks(workflow.id, 'video')
    expect(links).toHaveLength(1)
  })

  test('reconcileRun preserves not-found error semantics', async () => {
    const { workflowsService } = createServices()

    await expect(workflowsService.reconcileRun('missing-run')).rejects.toMatchObject({
      code: 'WORKFLOW_RUN_NOT_FOUND',
      status: 404,
    })
  })

  test('records workflow run and node lifecycle events', async () => {
    const { tasksService, workflowRunEventLog, workflowsService } = createServices()
    const workflow = await workflowsService.createWorkflow({
      name: 'workflow events',
      nodes: [imageNode('image', 1)],
      edges: [],
    })

    const run = await workflowsService.createRun(workflow.id, {
      selectedNodeId: 'image',
      expectedWorkflowVersion: workflow.version,
    })

    await runBackgroundCycle({ tasksService, workflowsService })
    const events = await workflowRunEventLog.listEvents(run.id)
    expect(events.map((event) => event.eventType)).toEqual([
      'workflow.run.created',
      'workflow.node.task_created',
      'workflow.node.started',
      'workflow.node.succeeded',
      'workflow.run.succeeded',
    ])
    expect(events[1]?.nodeId).toBe('image')
    expect(events[1]?.payload).toMatchObject({
      inputResourceCount: 0,
      nodeId: 'image',
      status: 'running',
    })
  })

  test('fails workflow run and records node failure when a node task fails', async () => {
    const failingProvider: TaskProvider = {
      poll: async () => ({
        code: 'PROVIDER_FAILED',
        message: 'Provider failed.',
        status: 'failed',
      }),
      start: async () => ({
        code: 'PROVIDER_FAILED',
        message: 'Provider failed.',
        status: 'failed',
      }),
    }
    const workflowRunEventLog = new InMemoryWorkflowRunEventLog()
    const tasksService = new TasksService(
      new InMemoryTaskRepository(),
      new PricingService(new InMemoryPricingRepository()),
      failingProvider,
    )
    const workflowsService = new WorkflowsService(
      new InMemoryWorkflowRepository(),
      tasksService,
      workflowRunEventLog,
    )
    const workflow = await workflowsService.createWorkflow({
      name: 'workflow failure',
      nodes: [imageNode('image', 1)],
      edges: [],
    })

    const run = await workflowsService.createRun(workflow.id, {
      selectedNodeId: 'image',
      expectedWorkflowVersion: workflow.version,
    })
    expect(run.status).toBe('running')

    await tasksService.startQueuedTasks()
    const [failedRun] = await workflowsService.reconcileRunningRuns()

    expect(failedRun?.status).toBe('failed')
    expect(failedRun?.nodeStates.image?.status).toBe('failed')
    const events = await workflowRunEventLog.listEvents(run.id)
    expect(events.map((event) => event.eventType)).toContain('workflow.node.failed')
    expect(events.map((event) => event.eventType)).toContain('workflow.run.failed')
  })
})
