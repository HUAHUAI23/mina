import type { CreatePostInput } from '@mina/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { createPost, deletePost, listPosts } from '../api/posts.client'

export const postsQueryKey = ['posts'] as const

export const useCreatePostMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreatePostInput) => createPost(input),
    mutationKey: ['create-post'],
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: postsQueryKey })
    },
  })
}

export const useDeletePostMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => deletePost(id),
    mutationKey: ['delete-post'],
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: postsQueryKey })
    },
  })
}

export const usePostsQuery = () =>
  useQuery({
    queryFn: listPosts,
    queryKey: postsQueryKey,
  })
