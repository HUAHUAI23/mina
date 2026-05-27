export const projectKeys = {
  all: ['projects'] as const,
  detail: (projectId: string) => [...projectKeys.all, 'detail', projectId] as const,
  overview: () => [...projectKeys.all, 'overview'] as const,
}
