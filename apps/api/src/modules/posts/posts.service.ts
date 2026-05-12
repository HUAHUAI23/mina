import type { CreatePostInput, DeletePostResponse, PostListResponse, PostResponse } from '@mina/contracts'

import { HttpError } from '../../lib/http/http-error'
import type { PostRepository } from './posts.repository'

export class PostsService {
  constructor(private readonly postRepository: PostRepository) {}

  async createPost(input: CreatePostInput): Promise<PostResponse> {
    const normalizedInput = {
      title: input.title.trim(),
      body: input.body.trim(),
    }

    return {
      item: await this.postRepository.create(normalizedInput),
    }
  }

  async deletePost(id: number): Promise<DeletePostResponse> {
    const removed = await this.postRepository.delete(id)
    if (!removed) {
      throw new HttpError(404, 'POST_NOT_FOUND', 'Post not found.')
    }

    return { success: true }
  }

  async getPost(id: number): Promise<PostResponse> {
    const post = await this.postRepository.findById(id)
    if (!post) {
      throw new HttpError(404, 'POST_NOT_FOUND', 'Post not found.')
    }

    return { item: post }
  }

  async listPosts(): Promise<PostListResponse> {
    return {
      items: await this.postRepository.list(),
    }
  }
}
