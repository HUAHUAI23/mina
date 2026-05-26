import { createCanvasPerformanceFixture } from '../../utils/performance-fixture'
import { createWorkflowYDoc, importWorkflowSnapshotToYjs } from './yjs-document'
import { exportWorkflowYjsSnapshot } from './yjs-snapshot'
import { workflowYjsCommands } from './workflow-yjs-commands'
import { registerWorkflowYjsRuntime, unregisterWorkflowYjsRuntime } from './workflow-yjs-store'

const fixture = createCanvasPerformanceFixture(1)
const workflowId = 'workflow_yjs_commands_spec'
const y = createWorkflowYDoc()

try {
  workflowYjsCommands.addMediaGenerationNode(
    { edges: [], nodes: [], workflowId: 'workflow_without_runtime' },
    {
      nodeType: 'image_generation',
      task: {
        kind: 'image_generation',
        model: 'gemini-3.1-flash-image-preview',
        params: { aspectRatio: '1:1', count: 1, imageSize: '1K' },
        prompt: 'A missing runtime should not clear the draft',
        provider: 'google',
      },
    },
  )
  throw new Error('Graph commands should throw when the workflow Yjs runtime is missing.')
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes('Yjs runtime not registered for workflow workflow_without_runtime')) {
    throw error
  }
}

importWorkflowSnapshotToYjs(y, fixture)
registerWorkflowYjsRuntime(workflowId, y, fixture)

try {
  const task = {
    kind: 'video_generation' as const,
    model: 'veo-3.1-generate-preview',
    params: { aspectRatio: '16:9', durationSeconds: 8, personGeneration: 'allow_all', resolution: '720p' },
    prompt: 'A slow dolly shot',
    provider: 'google',
  }
  const nodeId = workflowYjsCommands.addMediaGenerationNode(
    { edges: fixture.edges, nodes: fixture.nodes, workflowId },
    {
      mediaSlots: {
        firstFrame: [
          {
            id: 'draft_slot_1',
            order: 0,
            required: true,
            slot: 'firstFrame',
            source: { type: 'media_object', mediaObjectId: 'media_1' },
          },
        ],
        inputImages: [
          {
            id: 'incompatible_slot',
            order: 0,
            required: true,
            slot: 'inputImages',
            source: { type: 'media_object', mediaObjectId: 'media_2' },
          },
        ],
      },
      nodeType: 'video_generation',
      task,
    },
  )

  const snapshot = exportWorkflowYjsSnapshot(y)
  const created = snapshot.nodes.find((node) => node.id === nodeId)
  if (!created || created.data.nodeType !== 'video_generation') {
    throw new Error('addMediaGenerationNode should create a video generation node.')
  }
  if (created.data.config.task?.prompt !== task.prompt) {
    throw new Error('addMediaGenerationNode should initialize task config atomically.')
  }
  if (created.data.mediaSlots?.firstFrame?.[0]?.source.type !== 'media_object') {
    throw new Error('addMediaGenerationNode should initialize compatible media slots atomically.')
  }
  if (created.data.mediaSlots?.inputImages?.length) {
    throw new Error('addMediaGenerationNode should drop slots that are incompatible with the node type.')
  }

  const seededSnapshot = exportWorkflowYjsSnapshot(y)
  workflowYjsCommands.addSlotItem(
    { edges: seededSnapshot.edges, nodes: seededSnapshot.nodes, workflowId },
    nodeId,
    {
      id: 'unsupported_audio',
      order: 0,
      required: true,
      slot: 'referenceAudios',
      source: { type: 'media_object', mediaObjectId: 'media_audio' },
    },
  )
  const afterUnsupportedSlot = exportWorkflowYjsSnapshot(y).nodes.find((node) => node.id === nodeId)
  if (afterUnsupportedSlot?.data.nodeType === 'video_generation' && afterUnsupportedSlot.data.mediaSlots?.referenceAudios?.length) {
    throw new Error('addSlotItem should reject slots unsupported by the selected model capabilities.')
  }

  const promptContext = exportWorkflowYjsSnapshot(y)
  const beforePromptUpdate = promptContext.nodes.find((node) => node.id === nodeId)
  if (!beforePromptUpdate || beforePromptUpdate.data.nodeType !== 'video_generation') {
    throw new Error('seeded media node should still be present.')
  }
  workflowYjsCommands.setNodeTaskConfig(
    { edges: promptContext.edges, nodes: promptContext.nodes, workflowId },
    nodeId,
    {
      ...task,
      prompt: 'A faster tracking shot',
    },
  )
  const afterPromptUpdate = exportWorkflowYjsSnapshot(y).nodes.find((node) => node.id === nodeId)
  if (afterPromptUpdate?.data.nodeType !== 'video_generation') {
    throw new Error('setNodeTaskConfig should preserve the media node type.')
  }
  if (afterPromptUpdate.data.config.task?.prompt !== 'A faster tracking shot') {
    throw new Error('setNodeTaskConfig should update task prompt.')
  }
  if (afterPromptUpdate.data.mediaSlots?.firstFrame?.[0]?.id !== 'draft_slot_1') {
    throw new Error('field-level node updates should not overwrite unchanged media slots.')
  }
} finally {
  unregisterWorkflowYjsRuntime(workflowId, y)
  y.ydoc.destroy()
}

console.log('workflow yjs command checks passed')
