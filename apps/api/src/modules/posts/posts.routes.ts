import { sValidator } from '@hono/standard-validator'
import { CreatePostSchema, PostParamsSchema } from '@mina/contracts'
import { Hono } from 'hono'

import type { PostsService } from './posts.service'

export const createPostsRoutes = (postsService: PostsService): Hono =>
  new Hono()
    .get('/', async (c) => c.json(await postsService.listPosts()))
    .get('/:id', sValidator('param', PostParamsSchema), async (c) => {
      const { id } = c.req.valid('param')
      return c.json(await postsService.getPost(id))
    })
    .post('/', sValidator('json', CreatePostSchema), async (c) => {
      const payload = c.req.valid('json')
      return c.json(await postsService.createPost(payload), 201)
    })
    .delete('/:id', sValidator('param', PostParamsSchema), async (c) => {
      const { id } = c.req.valid('param')
      return c.json(await postsService.deletePost(id))
    })
