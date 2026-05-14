import type { Post } from '@mina/contracts/modules/posts'

export const createSeedPosts = (): Post[] => [
  {
    id: 1,
    title: 'Production-ready Hono modules',
    body: 'This repository now separates routing, services, repositories, and contracts for safer iteration.',
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
  },
  {
    id: 2,
    title: 'Bun workspaces with catalogs',
    body: 'Dependency versions are centralized so every workspace stays aligned with the same runtime baseline.',
    createdAt: new Date(Date.now() - 1_800_000).toISOString(),
  },
]
