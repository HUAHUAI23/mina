import { describe, expect, test } from 'bun:test'
import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import type { MediaSlotName, NodeOutputSelector } from '@mina/contracts/modules/media'

import { DEFAULT_ACCOUNT_ID } from '../accounts/accounts.data'
import { MediaObjectService } from '../media/media-object.service'
import { PricingService } from '../pricing/pricing.service'
import { TaskConfigAssembler } from '../tasks/config/task-config-assembler'
import { ModelRegistry } from '../tasks/models/model-registry'
import { ProviderRouter } from '../tasks/models/provider-router'
import { registerTaskModels } from '../tasks/models/register-models'
import { OutputPostProcessor } from '../tasks/output/output-post-processor'
import { TaskOutputFinalizer } from '../tasks/output/task-output-finalizer'
import { DeterministicVideoFrameGenerator } from '../tasks/output/video-frame-generator'
import type { TaskProvider } from '../tasks/providers/provider'
import { TasksService } from '../tasks/tasks.service'
import { validateCanvas } from './validation'
import { WorkflowMediaResolver } from './media/workflow-media-resolver'
import { InMemoryWorkflowEventBus } from './workflow-event-bus'
import {
  FakeMediaObjectRepository,
  FakeObjectStorage,
  FakePricingRepository,
  FakeTaskRepository,
  FakeWorkflowDefinitionRepository,
  FakeWorkflowNodeTaskRepository,
  FakeWorkflowRunEventLog,
  FakeWorkflowRunRepository,
} from '../../test/fakes'
import { WorkflowsService } from './workflows.service'

const createWorkflowRepositories = () => {
  const runs = new FakeWorkflowRunRepository()
  return {
    definitions: new FakeWorkflowDefinitionRepository(),
    nodeStates: runs,
    nodeTasks: new FakeWorkflowNodeTaskRepository(runs),
    runs,
  }
}

const createServices = (taskProvider?: TaskProvider) => {
  const taskRepository = new FakeTaskRepository()
  const workflowRunEventLog = new FakeWorkflowRunEventLog()
  const modelRegistry = registerTaskModels(new ModelRegistry())
  const taskConfigAssembler = new TaskConfigAssembler(modelRegistry)
  const mediaObjectService = new MediaObjectService(
    new FakeMediaObjectRepository(),
    new FakeObjectStorage(),
    {
      fetch: async () => {
        throw new Error('fetcher not configured')
      },
    },
  )
  const tasksService = new TasksService(
    taskRepository,
    new PricingService(new FakePricingRepository()),
    taskProvider ?? new ProviderRouter(modelRegistry),
    modelRegistry,
    new TaskOutputFinalizer(mediaObjectService),
    new OutputPostProcessor(
      new DeterministicVideoFrameGenerator(mediaObjectService),
    ),
  )
  const workflowsService = new WorkflowsService(
    createWorkflowRepositories(),
    tasksService,
    taskConfigAssembler,
    new WorkflowMediaResolver(mediaObjectService, tasksService),
    workflowRunEventLog,
    new InMemoryWorkflowEventBus(),
  )

  return {
    mediaObjectService,
    taskRepository,
    tasksService,
    workflowRunEventLog,
    workflowsService,
  }
}

const runBackgroundCycle = async (
  services: Pick<
    ReturnType<typeof createServices>,
    'tasksService' | 'workflowsService'
  >,
) => {
  await services.tasksService.startQueuedTasks()
  await services.tasksService.pollAsyncTasks()
  return services.workflowsService.reconcileRunningRuns()
}

const imageNode = (
  id: string,
  count: number,
  parentId?: string,
): WorkflowCanvasNode => ({
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
        provider: 'dev',
        model: 'dev-image',
        prompt: `prompt ${id}`,
        params: {
          count,
          size: '1024x1024',
        },
      },
    },
  },
})

const imageNodeWithMediaSlots = (
  node: WorkflowCanvasNode,
  mediaSlots: Extract<
    WorkflowCanvasNode['data'],
    { nodeType: 'image_generation' }
  >['mediaSlots'],
): WorkflowCanvasNode => {
  if (node.data.nodeType !== 'image_generation') {
    throw new Error('Expected image generation node.')
  }
  return {
    ...node,
    data: {
      ...node.data,
      mediaSlots,
    },
  }
}

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
        params: {
          durationSeconds: 5,
          outputLastFrame: true,
          resolution: '1080p',
        },
      },
    },
  },
})

const videoNodeWithMediaSlots = (
  node: WorkflowCanvasNode,
  mediaSlots: Extract<
    WorkflowCanvasNode['data'],
    { nodeType: 'video_generation' }
  >['mediaSlots'],
): WorkflowCanvasNode => {
  if (node.data.nodeType !== 'video_generation') {
    throw new Error('Expected video generation node.')
  }
  return {
    ...node,
    data: {
      ...node.data,
      mediaSlots,
    },
  }
}

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
  targetSlot: MediaSlotName,
  targetSlotItemId: string,
): WorkflowCanvasEdge => ({
  id,
  type: 'media',
  source,
  target,
  data: {
    connection: {
      kind: 'media_link',
      targetSlot,
      targetSlotItemId,
    },
  },
})

const nodeOutputSlot = (
  slot: MediaSlotName,
  nodeId: string,
  resolve: 'current_media' | 'run_output',
  selector?: NodeOutputSelector,
) => ({
  id: `slot-${nodeId}-${slot}`,
  order: 0,
  required: true,
  slot,
  source:
    resolve === 'run_output'
      ? {
          type: 'node_output' as const,
          nodeId,
          resolve,
          selector: selector ?? {
            resourceKind: 'image' as const,
            role: 'generated_image' as const,
            index: 0,
          },
        }
      : {
          type: 'node_output' as const,
          nodeId,
          resolve,
        },
})

describe('WorkflowsService execution semantics', () => {
  test('ordinary canvas uses the source node MediaView and does not run upstream nodes', async () => {
    const { taskRepository, tasksService, workflowsService } = createServices()
    const workflow = await workflowsService.createWorkflow({
      name: 'ordinary media view',
      nodes: [
        imageNode('a', 2),
        videoNodeWithMediaSlots(videoNode('b'), {
          firstFrame: [nodeOutputSlot('firstFrame', 'a', 'current_media')],
        }),
      ],
      edges: [
        mediaEdge('a-b', 'a', 'b', 'firstFrame', 'slot-a-firstFrame'),
      ],
    }, DEFAULT_ACCOUNT_ID)

    const sourceRun = await workflowsService.createRun(workflow.id, {
      selectedNodeId: 'a',
      expectedWorkflowVersion: workflow.version,
    }, DEFAULT_ACCOUNT_ID)
    const sourceTaskId = sourceRun.nodeStates.a?.taskId
    expect(sourceRun.status).toBe('running')
    expect(typeof sourceTaskId).toBe('string')
    if (!sourceTaskId) {
      throw new Error('Source task id was not created.')
    }
    const [completedSourceRun] = await runBackgroundCycle({
      tasksService,
      workflowsService,
    })
    expect(completedSourceRun?.status).toBe('succeeded')

    const sourceTask = await tasksService.getTask(sourceTaskId)
    const selectedOutput = sourceTask.output?.resources[1]
    expect(selectedOutput?.role).toBe('generated_image')
    if (!selectedOutput) {
      throw new Error('Selected output was not created.')
    }

    const updatedWorkflow = await workflowsService.checkpointWorkflow(workflow.id, {
      nodes: workflow.nodes.map((node) =>
        node.id === 'a' && node.data.nodeType === 'image_generation'
          ? {
              ...node,
              data: {
                ...node.data,
                mediaView: {
                  taskId: sourceTask.id,
                  outputResourceId: selectedOutput.id,
                  outputIndex: 1,
                },
              },
            }
          : node,
      ),
      edges: workflow.edges,
    }, DEFAULT_ACCOUNT_ID)

    const targetRun = await workflowsService.createRun(updatedWorkflow.id, {
      selectedNodeId: 'b',
      expectedWorkflowVersion: updatedWorkflow.version,
    }, DEFAULT_ACCOUNT_ID)
    const targetTaskId = targetRun.nodeStates.b?.taskId
    expect(targetRun.status).toBe('running')
    expect(typeof targetTaskId).toBe('string')
    if (!targetTaskId) {
      throw new Error('Target task id was not created.')
    }

    const sourceLinks = await workflowsService.getNodeTasks(workflow.id, 'a', DEFAULT_ACCOUNT_ID)
    expect(sourceLinks).toHaveLength(1)
    expect(sourceLinks[0]?.task.id).toBe(sourceTask.id)

    const inputResources = (
      await taskRepository.listResources(targetTaskId)
    ).filter((resource) => resource.direction === 'input')
    expect(inputResources).toHaveLength(1)
    expect(inputResources[0]?.role).toBe('first_frame')
    expect(inputResources[0]?.url).toBe(selectedOutput?.url)
    expect(inputResources[0]?.mediaObjectId).toBe(selectedOutput?.mediaObjectId)
    expect(inputResources[0]?.source).toMatchObject({
      type: 'workflow_current_media',
      nodeId: 'a',
      taskId: sourceTask.id,
    })
  })

  test('ordinary canvas runs a node with media object slot input and no edges', async () => {
    const { mediaObjectService, taskRepository, workflowsService } =
      createServices()
    const mediaObject = await mediaObjectService.createFromBuffer({
      accountId: DEFAULT_ACCOUNT_ID,
      body: new TextEncoder().encode('input-image'),
      kind: 'image',
      mimeType: 'image/png',
      origin: 'user_upload',
      purpose: 'workflow_slot',
      retention: 'project_scoped',
    })
    const node = imageNode('image', 1)
    const workflow = await workflowsService.createWorkflow({
      name: 'media object slot',
      nodes: [
        imageNodeWithMediaSlots(node, {
          inputImages: [
            {
              id: 'slot-local',
              order: 0,
              required: true,
              slot: 'inputImages',
              source: {
                type: 'media_object',
                mediaObjectId: mediaObject.id,
              },
            },
          ],
        }),
      ],
      edges: [],
    }, DEFAULT_ACCOUNT_ID)

    const run = await workflowsService.createRun(workflow.id, {
      selectedNodeId: 'image',
      expectedWorkflowVersion: workflow.version,
    }, DEFAULT_ACCOUNT_ID)
    const taskId = run.nodeStates.image?.taskId
    expect(typeof taskId).toBe('string')
    if (!taskId) {
      throw new Error('Task id was not created.')
    }
    const inputResources = (await taskRepository.listResources(taskId)).filter(
      (resource) => resource.direction === 'input',
    )
    expect(inputResources).toHaveLength(1)
    expect(inputResources[0]).toMatchObject({
      mediaObjectId: mediaObject.id,
      role: 'reference_image',
      slot: 'inputImages',
      slotItemId: 'slot-local',
      slotOrder: 0,
      source: {
        type: 'media_object',
        mediaObjectId: mediaObject.id,
      },
    })
  })

  test('mediaSlots preserve mixed item order inside one slot', async () => {
    const { mediaObjectService, taskRepository, workflowsService } =
      createServices()
    const first = await mediaObjectService.createFromBuffer({
      accountId: DEFAULT_ACCOUNT_ID,
      body: new TextEncoder().encode('first'),
      kind: 'image',
      mimeType: 'image/png',
      origin: 'user_upload',
      purpose: 'workflow_slot',
      retention: 'project_scoped',
    })
    const second = await mediaObjectService.createFromBuffer({
      accountId: DEFAULT_ACCOUNT_ID,
      body: new TextEncoder().encode('second'),
      kind: 'image',
      mimeType: 'image/png',
      origin: 'user_upload',
      purpose: 'workflow_slot',
      retention: 'project_scoped',
    })
    const node = imageNode('image', 1)
    const workflow = await workflowsService.createWorkflow({
      name: 'media object order',
      nodes: [
        imageNodeWithMediaSlots(node, {
          inputImages: [
            {
              id: 'slot-second',
              order: 20,
              required: true,
              slot: 'inputImages',
              source: { type: 'media_object', mediaObjectId: second.id },
            },
            {
              id: 'slot-first',
              order: 10,
              required: true,
              slot: 'inputImages',
              source: { type: 'media_object', mediaObjectId: first.id },
            },
          ],
        }),
      ],
      edges: [],
    }, DEFAULT_ACCOUNT_ID)

    const run = await workflowsService.createRun(workflow.id, {
      selectedNodeId: 'image',
      expectedWorkflowVersion: workflow.version,
    }, DEFAULT_ACCOUNT_ID)
    const taskId = run.nodeStates.image?.taskId
    expect(typeof taskId).toBe('string')
    if (!taskId) {
      throw new Error('Task id was not created.')
    }

    const inputResources = (await taskRepository.listResources(taskId)).filter(
      (resource) => resource.direction === 'input',
    )
    expect(inputResources.map((resource) => resource.mediaObjectId)).toEqual([
      first.id,
      second.id,
    ])
    expect(inputResources.map((resource) => resource.slotOrder)).toEqual([
      10, 20,
    ])
  })

  test('mediaSlots preserve media object plus upstream A and B mixed order', async () => {
    const providerOutputByPrompt = new Map<string, string>()
    const taskProvider: TaskProvider = {
      poll: async () => ({
        code: 'NOT_ASYNC',
        message: 'not async',
        status: 'failed',
      }),
      start: async (task) => {
        const mediaObjectId = providerOutputByPrompt.get(task.config.prompt)
        if (!mediaObjectId) {
          throw new Error(`Missing provider output for ${task.config.prompt}.`)
        }
        return {
          output: {
            resources: [
              {
                id: `${task.id}:image:0`,
                kind: 'image',
                role: 'generated_image',
                index: 0,
                url: `mina://media/${mediaObjectId}`,
              },
            ],
            variables: {},
          },
          status: 'succeeded',
        }
      },
    }
    const { mediaObjectService, taskRepository, tasksService, workflowsService } =
      createServices(taskProvider)
    const local = await mediaObjectService.createFromBuffer({
      accountId: DEFAULT_ACCOUNT_ID,
      body: new TextEncoder().encode('local'),
      kind: 'image',
      mimeType: 'image/png',
      origin: 'user_upload',
      purpose: 'workflow_slot',
      retention: 'project_scoped',
    })
    const fromA = await mediaObjectService.createFromBuffer({
      accountId: DEFAULT_ACCOUNT_ID,
      body: new TextEncoder().encode('a'),
      kind: 'image',
      mimeType: 'image/png',
      origin: 'task_output',
      purpose: 'task_output',
      retention: 'task_scoped',
    })
    const fromB = await mediaObjectService.createFromBuffer({
      accountId: DEFAULT_ACCOUNT_ID,
      body: new TextEncoder().encode('b'),
      kind: 'image',
      mimeType: 'image/png',
      origin: 'task_output',
      purpose: 'task_output',
      retention: 'task_scoped',
    })
    providerOutputByPrompt.set('prompt a', fromA.id)
    providerOutputByPrompt.set('prompt b', fromB.id)

    const baseA = imageNode('a', 1)
    const baseB = imageNode('b', 1)
    const sourceWorkflow = await workflowsService.createWorkflow({
      name: 'mixed order sources',
      nodes: [baseA, baseB],
      edges: [],
    }, DEFAULT_ACCOUNT_ID)
    const runA = await workflowsService.createRun(sourceWorkflow.id, {
      selectedNodeId: 'a',
      expectedWorkflowVersion: sourceWorkflow.version,
    }, DEFAULT_ACCOUNT_ID)
    await tasksService.startQueuedTasks()
    await workflowsService.reconcileRunningRuns()
    const taskAId = runA.nodeStates.a?.taskId
    if (!taskAId) {
      throw new Error('Task A id was not created.')
    }
    const workflowWithA = await workflowsService.checkpointWorkflow(sourceWorkflow.id, {
      nodes: sourceWorkflow.nodes.map((node) =>
        node.id === 'a' && node.data.nodeType === 'image_generation'
          ? {
              ...node,
              data: {
                ...node.data,
                mediaView: {
                  taskId: taskAId,
                  outputIndex: 0,
                },
              },
            }
          : node,
      ),
      edges: sourceWorkflow.edges,
    }, DEFAULT_ACCOUNT_ID)
    const runB = await workflowsService.createRun(sourceWorkflow.id, {
      selectedNodeId: 'b',
      expectedWorkflowVersion: workflowWithA.version,
    }, DEFAULT_ACCOUNT_ID)
    await tasksService.startQueuedTasks()
    await workflowsService.reconcileRunningRuns()
    const taskBId = runB.nodeStates.b?.taskId
    if (!taskBId) {
      throw new Error('Task B id was not created.')
    }

    const target = imageNodeWithMediaSlots(imageNode('target', 1), {
      inputImages: [
        {
          id: 'slot-b',
          order: 30,
          required: true,
          slot: 'inputImages',
          source: { type: 'node_output', nodeId: 'b', resolve: 'current_media' },
        },
        {
          id: 'slot-local',
          order: 10,
          required: true,
          slot: 'inputImages',
          source: { type: 'media_object', mediaObjectId: local.id },
        },
        {
          id: 'slot-a',
          order: 20,
          required: true,
          slot: 'inputImages',
          source: { type: 'node_output', nodeId: 'a', resolve: 'current_media' },
        },
      ],
    })
    const workflowWithB = await workflowsService.checkpointWorkflow(sourceWorkflow.id, {
      nodes: workflowWithA.nodes.map((node) =>
        node.id === 'b' && node.data.nodeType === 'image_generation'
          ? {
              ...node,
              data: {
                ...node.data,
                mediaView: {
                  taskId: taskBId,
                  outputIndex: 0,
                },
              },
            }
          : node,
      ),
      edges: workflowWithA.edges,
    }, DEFAULT_ACCOUNT_ID)
    const workflow = await workflowsService.checkpointWorkflow(sourceWorkflow.id, {
      nodes: [
        workflowWithB.nodes[0] ?? baseA,
        workflowWithB.nodes[1] ?? baseB,
        target,
      ],
      edges: [
        {
          id: 'edge-a-target',
          type: 'media',
          source: 'a',
          target: 'target',
          data: {
            connection: {
              kind: 'media_link',
              targetSlot: 'inputImages',
              targetSlotItemId: 'slot-a',
            },
          },
        },
        {
          id: 'edge-b-target',
          type: 'media',
          source: 'b',
          target: 'target',
          data: {
            connection: {
              kind: 'media_link',
              targetSlot: 'inputImages',
              targetSlotItemId: 'slot-b',
            },
          },
        },
      ],
    }, DEFAULT_ACCOUNT_ID)

    const targetRun = await workflowsService.createRun(workflow.id, {
      selectedNodeId: 'target',
      expectedWorkflowVersion: workflow.version,
    }, DEFAULT_ACCOUNT_ID)
    const targetTaskId = targetRun.nodeStates.target?.taskId
    if (!targetTaskId) {
      throw new Error('Target task id was not created.')
    }
    const inputResources = (await taskRepository.listResources(targetTaskId)).filter(
      (resource) => resource.direction === 'input',
    )

    expect(inputResources.map((resource) => resource.mediaObjectId)).toEqual([
      local.id,
      fromA.id,
      fromB.id,
    ])
    expect(inputResources.map((resource) => resource.slotItemId)).toEqual([
      'slot-local',
      'slot-a',
      'slot-b',
    ])
  })

  test('optional missing node output slot is skipped', async () => {
    const { taskRepository, workflowsService } = createServices()
    const target = imageNodeWithMediaSlots(imageNode('target', 1), {
      inputImages: [
        {
          id: 'slot-optional',
          order: 0,
          required: false,
          slot: 'inputImages',
          source: { type: 'node_output', nodeId: 'source', resolve: 'current_media' },
        },
      ],
    })
    const workflow = await workflowsService.createWorkflow({
      name: 'optional missing',
      nodes: [imageNode('source', 1), target],
      edges: [
        {
          id: 'edge-source-target',
          type: 'media',
          source: 'source',
          target: 'target',
          data: {
            connection: {
              kind: 'media_link',
              targetSlot: 'inputImages',
              targetSlotItemId: 'slot-optional',
            },
          },
        },
      ],
    }, DEFAULT_ACCOUNT_ID)

    const run = await workflowsService.createRun(workflow.id, {
      selectedNodeId: 'target',
      expectedWorkflowVersion: workflow.version,
    }, DEFAULT_ACCOUNT_ID)
    const taskId = run.nodeStates.target?.taskId
    if (!taskId) {
      throw new Error('Task id was not created.')
    }

    const inputResources = (await taskRepository.listResources(taskId)).filter(
      (resource) => resource.direction === 'input',
    )
    expect(inputResources).toHaveLength(0)
  })

  test('validates media_link edges against mediaSlots', () => {
    const target = imageNodeWithMediaSlots(imageNode('target', 1), {
      inputImages: [
        {
          id: 'slot-a',
          order: 0,
          required: true,
          slot: 'inputImages',
          source: { type: 'node_output', nodeId: 'a', resolve: 'current_media' },
        },
      ],
    })

    expect(() =>
      validateCanvas(
        [
          imageNode('a', 1),
          imageNode('b', 1),
          target,
        ],
        [
          {
            id: 'edge-a-target',
            type: 'media',
            source: 'a',
            target: 'target',
            data: {
              connection: {
                kind: 'media_link',
                targetSlot: 'inputImages',
                targetSlotItemId: 'slot-a',
              },
            },
          },
          {
            id: 'edge-b-target',
            type: 'media',
            source: 'b',
            target: 'target',
            data: {
              connection: {
                kind: 'media_link',
                targetSlot: 'inputImages',
                targetSlotItemId: 'missing-slot',
              },
            },
          },
        ],
      ),
    ).toThrow('Media edge must point to a matching media slot item.')
  })

  test('ordinary canvas rejects a required upstream slot without MediaView output', async () => {
    const { workflowsService } = createServices()
    const workflow = await workflowsService.createWorkflow({
      name: 'missing upstream',
      nodes: [
        imageNode('a', 1),
        videoNodeWithMediaSlots(videoNode('b'), {
          firstFrame: [nodeOutputSlot('firstFrame', 'a', 'current_media')],
        }),
      ],
      edges: [
        mediaEdge('a-b', 'a', 'b', 'firstFrame', 'slot-a-firstFrame'),
      ],
    }, DEFAULT_ACCOUNT_ID)

    await expect(
      workflowsService.createRun(workflow.id, {
        selectedNodeId: 'b',
        expectedWorkflowVersion: workflow.version,
      }, DEFAULT_ACCOUNT_ID),
    ).rejects.toMatchObject({
      code: 'WORKFLOW_UPSTREAM_OUTPUT_MISSING',
      status: 422,
    })
  })

  test('fails execution when node type and task kind do not match', async () => {
    const { workflowsService } = createServices()
    const baseNode = imageNode('image', 1)
    const invalidNode: WorkflowCanvasNode = {
      ...baseNode,
      data: {
        nodeType: 'image_generation',
        title: 'image',
        config: {
          task: {
            kind: 'video_generation',
            provider: 'dev',
            model: 'dev-video',
            prompt: 'wrong kind',
            params: {},
          },
        },
      },
    }
    const workflow = await workflowsService.createWorkflow({
      name: 'kind mismatch',
      nodes: [invalidNode],
      edges: [],
    }, DEFAULT_ACCOUNT_ID)

    const run = await workflowsService.createRun(workflow.id, {
      selectedNodeId: 'image',
      expectedWorkflowVersion: workflow.version,
    }, DEFAULT_ACCOUNT_ID)

    expect(run.status).toBe('failed')
    expect(run.error).toContain('task kind does not match node type')
  })

  test('flow group executes all roots and resolves selected run outputs by role and index', async () => {
    const { taskRepository, tasksService, workflowsService } = createServices()
    const workflow = await workflowsService.createWorkflow({
      name: 'flow group',
      nodes: [
        flowGroupNode('group'),
        { ...imageNode('a', 2, 'group'), position: { x: 40, y: 80 } },
        { ...imageNode('c', 1, 'group'), position: { x: 40, y: 220 } },
        {
          ...videoNodeWithMediaSlots(videoNode('b', 'group'), {
            firstFrame: [
              nodeOutputSlot('firstFrame', 'a', 'run_output', {
                resourceKind: 'image',
                role: 'generated_image',
                index: 1,
              }),
            ],
            referenceImages: [
              nodeOutputSlot('referenceImages', 'c', 'run_output', {
                resourceKind: 'image',
                role: 'generated_image',
                index: 0,
              }),
            ],
          }),
          position: { x: 420, y: 120 },
        },
      ],
      edges: [
        mediaEdge('a-b', 'a', 'b', 'firstFrame', 'slot-a-firstFrame'),
        mediaEdge('c-b', 'c', 'b', 'referenceImages', 'slot-c-referenceImages'),
      ],
    }, DEFAULT_ACCOUNT_ID)

    const run = await workflowsService.createRun(workflow.id, {
      selectedNodeId: 'b',
      expectedWorkflowVersion: workflow.version,
    }, DEFAULT_ACCOUNT_ID)
    expect(run.status).toBe('running')
    expect(run.nodeStates.a?.status).toBe('running')
    expect(run.nodeStates.c?.status).toBe('running')
    expect(run.nodeStates.b?.status).toBe('pending')

    const [rootCompletedRun] = await runBackgroundCycle({
      tasksService,
      workflowsService,
    })
    expect(rootCompletedRun?.status).toBe('running')
    expect(rootCompletedRun?.nodeStates.a?.status).toBe('succeeded')
    expect(rootCompletedRun?.nodeStates.c?.status).toBe('succeeded')
    expect(rootCompletedRun?.nodeStates.b?.status).toBe('running')

    const videoTaskId = rootCompletedRun?.nodeStates.b?.taskId
    expect(typeof videoTaskId).toBe('string')
    if (!videoTaskId) {
      throw new Error('Video task id was not created.')
    }
    const inputResources = (
      await taskRepository.listResources(videoTaskId)
    ).filter((resource) => resource.direction === 'input')
    expect(inputResources.map((resource) => resource.role)).toEqual([
      'first_frame',
      'reference_image',
    ])
    expect(inputResources[0]?.source).toMatchObject({
      type: 'workflow_run_output',
      nodeId: 'a',
    })
    expect(inputResources[1]?.source).toMatchObject({
      type: 'workflow_run_output',
      nodeId: 'c',
    })

    const [completedRun] = await runBackgroundCycle({
      tasksService,
      workflowsService,
    })
    expect(completedRun?.status).toBe('succeeded')
    expect(
      completedRun?.nodeStates.b?.output?.resources.map(
        (resource) => resource.role,
      ),
    ).toEqual(['generated_video', 'last_frame', 'first_frame', 'video_cover'])
  })

  test('repeated reconciliation does not create duplicate workflow node tasks', async () => {
    const { taskRepository, workflowsService } = createServices()
    const workflow = await workflowsService.createWorkflow({
      name: 'idempotent reconcile',
      nodes: [imageNode('image', 1)],
      edges: [],
    }, DEFAULT_ACCOUNT_ID)

    const run = await workflowsService.createRun(workflow.id, {
      selectedNodeId: 'image',
      expectedWorkflowVersion: workflow.version,
    }, DEFAULT_ACCOUNT_ID)
    const taskId = run.nodeStates.image?.taskId
    if (!taskId) {
      throw new Error('Task id was not created.')
    }

    const first = await workflowsService.reconcileRun(run.id)
    const second = await workflowsService.reconcileRun(run.id)
    const links = await workflowsService.getNodeTasks(workflow.id, 'image', DEFAULT_ACCOUNT_ID)

    expect(first.nodeStates.image?.taskId).toBe(taskId)
    expect(second.nodeStates.image?.taskId).toBe(taskId)
    expect(links).toHaveLength(1)
    expect(links[0]?.task.id).toBe(taskId)
    expect(await taskRepository.list()).toHaveLength(1)
  })

  test('updating one node state does not overwrite another node state', async () => {
    const { tasksService, workflowsService } = createServices()
    const workflow = await workflowsService.createWorkflow({
      name: 'independent node states',
      nodes: [
        flowGroupNode('group'),
        { ...imageNode('a', 1, 'group'), position: { x: 40, y: 80 } },
        { ...imageNode('b', 1, 'group'), position: { x: 40, y: 220 } },
      ],
      edges: [],
    }, DEFAULT_ACCOUNT_ID)

    const run = await workflowsService.createRun(workflow.id, {
      selectedNodeId: 'group',
      expectedWorkflowVersion: workflow.version,
    }, DEFAULT_ACCOUNT_ID)
    expect(run.nodeStates.a?.status).toBe('running')
    expect(run.nodeStates.b?.status).toBe('running')

    const taskAId = run.nodeStates.a?.taskId
    if (!taskAId) {
      throw new Error('Task A id was not created.')
    }
    await tasksService.runTask(taskAId)
    const reconciled = await workflowsService.reconcileRun(run.id)

    expect(reconciled.nodeStates.a?.status).toBe('succeeded')
    expect(reconciled.nodeStates.b?.status).toBe('running')
    expect(reconciled.nodeStates.b?.taskId).toBe(run.nodeStates.b?.taskId)
  })

  test('video duration pricing uses model and pricing key rules', async () => {
    const { tasksService, workflowsService } = createServices()
    const workflow = await workflowsService.createWorkflow({
      name: 'pricing',
      nodes: [videoNode('video')],
      edges: [],
    }, DEFAULT_ACCOUNT_ID)

    const run = await workflowsService.createRun(workflow.id, {
      selectedNodeId: 'video',
      expectedWorkflowVersion: workflow.version,
    }, DEFAULT_ACCOUNT_ID)

    const taskId = run.nodeStates.video?.taskId
    expect(typeof taskId).toBe('string')
    if (!taskId) {
      throw new Error('Video task id was not created.')
    }
    const task = await tasksService.getTask(taskId)
    expect(task.cost.estimatedCost).toBe(50)
    const links = await workflowsService.getNodeTasks(workflow.id, 'video', DEFAULT_ACCOUNT_ID)
    expect(links).toHaveLength(1)
    expect(links[0]?.task.id).toBe(taskId)
  })

  test('reconcileRun preserves not-found error semantics', async () => {
    const { workflowsService } = createServices()

    await expect(
      workflowsService.reconcileRun('missing-run'),
    ).rejects.toMatchObject({
      code: 'WORKFLOW_RUN_NOT_FOUND',
      status: 404,
    })
  })

  test('records workflow run and node lifecycle events', async () => {
    const { tasksService, workflowRunEventLog, workflowsService } =
      createServices()
    const workflow = await workflowsService.createWorkflow({
      name: 'workflow events',
      nodes: [imageNode('image', 1)],
      edges: [],
    }, DEFAULT_ACCOUNT_ID)

    const run = await workflowsService.createRun(workflow.id, {
      selectedNodeId: 'image',
      expectedWorkflowVersion: workflow.version,
    }, DEFAULT_ACCOUNT_ID)

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
    const workflowRunEventLog = new FakeWorkflowRunEventLog()
    const modelRegistry = registerTaskModels(new ModelRegistry())
    const taskConfigAssembler = new TaskConfigAssembler(modelRegistry)
    const mediaObjectService = new MediaObjectService(
      new FakeMediaObjectRepository(),
      new FakeObjectStorage(),
      {
        fetch: async () => {
          throw new Error('fetcher not configured')
        },
      },
    )
    const tasksService = new TasksService(
      new FakeTaskRepository(),
      new PricingService(new FakePricingRepository()),
      failingProvider,
      modelRegistry,
      new TaskOutputFinalizer(mediaObjectService),
      new OutputPostProcessor(
        new DeterministicVideoFrameGenerator(mediaObjectService),
      ),
    )
    const workflowsService = new WorkflowsService(
      createWorkflowRepositories(),
      tasksService,
      taskConfigAssembler,
      new WorkflowMediaResolver(mediaObjectService, tasksService),
      workflowRunEventLog,
      new InMemoryWorkflowEventBus(),
    )
    const workflow = await workflowsService.createWorkflow({
      name: 'workflow failure',
      nodes: [imageNode('image', 1)],
      edges: [],
    }, DEFAULT_ACCOUNT_ID)

    const run = await workflowsService.createRun(workflow.id, {
      selectedNodeId: 'image',
      expectedWorkflowVersion: workflow.version,
    }, DEFAULT_ACCOUNT_ID)
    expect(run.status).toBe('running')

    await tasksService.startQueuedTasks()
    const [failedRun] = await workflowsService.reconcileRunningRuns()

    expect(failedRun?.status).toBe('failed')
    expect(failedRun?.nodeStates.image?.status).toBe('failed')
    const events = await workflowRunEventLog.listEvents(run.id)
    expect(events.map((event) => event.eventType)).toContain(
      'workflow.node.failed',
    )
    expect(events.map((event) => event.eventType)).toContain(
      'workflow.run.failed',
    )
  })
})
