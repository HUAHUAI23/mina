import { z } from 'zod'

export const PostIdSchema = z.coerce.number().int().positive()

export const PostSchema = z.object({
  id: PostIdSchema,
  title: z.string().min(3).max(120),
  body: z.string().min(10).max(5_000),
  createdAt: z.string().datetime(),
})

export const CreatePostSchema = z.object({
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(10).max(5_000),
})

export const PostParamsSchema = z.object({
  id: PostIdSchema,
})

export const PostListResponseSchema = z.object({
  items: z.array(PostSchema),
})

export const PostResponseSchema = z.object({
  item: PostSchema,
})

export const DeletePostResponseSchema = z.object({
  success: z.literal(true),
})

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
})

export type ApiError = z.infer<typeof ApiErrorSchema>
export type CreatePostInput = z.infer<typeof CreatePostSchema>
export type DeletePostResponse = z.infer<typeof DeletePostResponseSchema>
export type Post = z.infer<typeof PostSchema>
export type PostListResponse = z.infer<typeof PostListResponseSchema>
export type PostParams = z.infer<typeof PostParamsSchema>
export type PostResponse = z.infer<typeof PostResponseSchema>
