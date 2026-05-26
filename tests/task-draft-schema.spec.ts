import { WorkflowCanvasNodeSchema } from '../packages/contracts/src/modules/canvas/canvas.schemas'
import { TaskConfigSchema, TaskDraftConfigSchema } from '../packages/contracts/src/modules/tasks/task.schemas'

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message)
  }
}

const draftTask = {
  kind: 'image_generation' as const,
  provider: 'google',
  model: 'gemini-3.1-flash-image-preview',
  prompt: '',
  params: {},
}

assert(TaskDraftConfigSchema.parse(draftTask).prompt === '', 'canvas task drafts should allow an empty prompt')

assert(
  WorkflowCanvasNodeSchema.safeParse({
    id: 'node_empty_prompt',
    type: 'image_generation',
    position: { x: 0, y: 0 },
    data: {
      nodeType: 'image_generation',
      title: 'Image Node',
      config: { task: draftTask },
      mediaSlots: {},
    },
  }).success,
  'workflow canvas nodes should allow empty draft prompts',
)

assert(
  !TaskConfigSchema.safeParse({
    ...draftTask,
    media: {
      inputImages: [],
      referenceImages: [],
      referenceAudios: [],
      referenceVideos: [],
    },
  }).success,
  'runnable task configs should reject empty prompts',
)

console.log('task draft schema checks passed')
