export const chatKeys = {
  all: ['chat'] as const,
  threadRoot: (workflowId: string) => [...chatKeys.all, 'workflow', workflowId] as const,
  threads: (workflowId: string) => [...chatKeys.threadRoot(workflowId), 'threads'] as const,
  messages: (threadId: string) => [...chatKeys.all, 'thread', threadId, 'messages'] as const,
}
