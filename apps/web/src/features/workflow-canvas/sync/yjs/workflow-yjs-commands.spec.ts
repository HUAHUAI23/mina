import { createCanvasPerformanceFixture } from '../../utils/performance-fixture'
import { createWorkflowYDoc, importWorkflowSnapshotToYjs } from './yjs-document'
import { exportWorkflowYjsSnapshot } from './yjs-snapshot'
import { workflowYjsCommands } from './workflow-yjs-commands'
import { registerWorkflowYjsRuntime, unregisterWorkflowYjsRuntime } from './workflow-yjs-store'

const fixture = createCanvasPerformanceFixture(1)
const workflowId = 'workflow_yjs_commands_spec'
const y = createWorkflowYDoc()

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
} finally {
  unregisterWorkflowYjsRuntime(workflowId, y)
  y.ydoc.destroy()
}

console.log('workflow yjs command checks passed')
