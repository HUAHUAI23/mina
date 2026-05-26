import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import { taskWithCompatibleModel, tasksEqual } from '../forms/model-compatibility'

export const updateNodesWithCompatibleMediaModels = (
  nodes: readonly WorkflowCanvasNode[],
): WorkflowCanvasNode[] => {
  let changed = false
  const nextNodes = nodes.map((node) => {
    if (node.data.nodeType !== 'image_generation' && node.data.nodeType !== 'video_generation') {
      return node
    }
    const task = node.data.config.task
    if (!task) {
      return node
    }
    const nextTask = taskWithCompatibleModel(task, node.data.mediaSlots ?? {})
    if (tasksEqual(nextTask, task)) {
      return node
    }
    changed = true
    return {
      ...node,
      data: {
        ...node.data,
        config: {
          ...node.data.config,
          task: nextTask,
        },
      },
    }
  })
  return changed ? nextNodes : [...nodes]
}
