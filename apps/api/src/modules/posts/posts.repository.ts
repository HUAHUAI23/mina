import type { CreatePostInput, Post } from '@mina/contracts'

export interface PostRepository {
  create(input: CreatePostInput): Promise<Post>
  delete(id: number): Promise<boolean>
  findById(id: number): Promise<Post | undefined>
  list(): Promise<Post[]>
}

const clonePost = (post: Post): Post => ({ ...post })

export class InMemoryPostRepository implements PostRepository {
  readonly #items: Post[]
  #nextId: number

  constructor(initialPosts: Post[]) {
    this.#items = initialPosts.map(clonePost)
    this.#nextId = initialPosts.reduce((maxId, post) => Math.max(maxId, post.id), 0) + 1
  }

  async create(input: CreatePostInput): Promise<Post> {
    const post: Post = {
      id: this.#nextId++,
      title: input.title,
      body: input.body,
      createdAt: new Date().toISOString(),
    }

    this.#items.unshift(post)
    return clonePost(post)
  }

  async delete(id: number): Promise<boolean> {
    const index = this.#items.findIndex((post) => post.id === id)
    if (index === -1) {
      return false
    }

    this.#items.splice(index, 1)
    return true
  }

  async findById(id: number): Promise<Post | undefined> {
    const post = this.#items.find((item) => item.id === id)
    return post ? clonePost(post) : undefined
  }

  async list(): Promise<Post[]> {
    return [...this.#items].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).map(clonePost)
  }
}
