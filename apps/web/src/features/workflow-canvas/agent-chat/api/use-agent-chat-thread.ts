import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { chatKeys } from './chat-keys'
import { createChatThread, listChatThreads } from './chat-client'

export const useAgentChatThread = (workflowId: string, enabled: boolean) => {
  const queryClient = useQueryClient()
  const threadsQuery = useQuery({
    enabled,
    queryFn: () => listChatThreads(workflowId),
    queryKey: chatKeys.threads(workflowId),
  })
  const createThreadMutation = useMutation({
    mutationFn: () => createChatThread(workflowId),
    onSuccess: (response) => {
      queryClient.setQueryData(chatKeys.threads(workflowId), { items: [response.item] })
    },
  })

  const thread = useMemo(() => threadsQuery.data?.items[0], [threadsQuery.data])

  const createThread = createThreadMutation.mutate
  const createThreadPending = createThreadMutation.isPending
  const retry = () => {
    if (createThreadMutation.isError) {
      createThread()
      return
    }
    void threadsQuery.refetch()
  }

  useEffect(() => {
    if (enabled && threadsQuery.isSuccess && !thread && !createThreadPending) {
      createThread()
    }
  }, [createThread, createThreadPending, enabled, thread, threadsQuery.isSuccess])

  return {
    error: threadsQuery.error ?? createThreadMutation.error,
    isLoading: threadsQuery.isLoading || createThreadMutation.isPending,
    retry,
    thread: thread ?? createThreadMutation.data?.item,
  }
}
