export const workflowKeys = {
  all: ['workflows'] as const,
  detail: (workflowId: string) => [...workflowKeys.all, 'detail', workflowId] as const,
  list: () => [...workflowKeys.all, 'list'] as const,
  nodeTasks: (workflowId: string, nodeId: string) => [...workflowKeys.detail(workflowId), 'nodeTasks', nodeId] as const,
  runs: (workflowId: string) => [...workflowKeys.detail(workflowId), 'runs'] as const,
}

export const taskKeys = {
  detail: (taskId: string) => ['tasks', 'detail', taskId] as const,
  models: () => ['tasks', 'models'] as const,
}

export const mediaKeys = {
  detail: (mediaObjectId: string) => ['mediaObjects', 'detail', mediaObjectId] as const,
}
