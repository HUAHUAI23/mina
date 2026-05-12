import type { AppType } from '@mina/api/client'
import {
  DeletePostResponseSchema,
  PostListResponseSchema,
  PostResponseSchema,
  type CreatePostInput,
  type DeletePostResponse,
  type Post,
} from '@mina/contracts'
import { hc } from 'hono/client'

import { webEnv } from '../../../config/env'
import { readJson } from '../../../lib/http'

const client = hc<AppType>(webEnv.apiBaseUrl)

export const createPost = async (input: CreatePostInput): Promise<Post> => {
  const response = await client.api.posts.$post({ json: input })
  const payload = await readJson(response, PostResponseSchema)
  return payload.item
}

export const deletePost = async (id: number): Promise<DeletePostResponse> => {
  const response = await client.api.posts[':id'].$delete({
    param: { id: String(id) },
  })

  return readJson(response, DeletePostResponseSchema)
}

export const listPosts = async (): Promise<Post[]> => {
  const response = await client.api.posts.$get()
  const payload = await readJson(response, PostListResponseSchema)
  return payload.items
}
