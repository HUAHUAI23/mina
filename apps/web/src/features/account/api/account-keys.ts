export const accountKeys = {
  all: ['account'] as const,
  billing: () => [...accountKeys.all, 'billing'] as const,
  profile: () => [...accountKeys.all, 'profile'] as const,
  storage: () => [...accountKeys.all, 'storage'] as const,
}
