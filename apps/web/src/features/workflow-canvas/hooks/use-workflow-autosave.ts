import { useCallback, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { WorkflowResponse } from '@mina/contracts/modules/workflows'

import { workflowKeys } from '../api/workflow-keys'
import { saveWorkflow } from '../api/workflow-queries'
import { getCanvasSnapshot, useCanvasStore } from '../store/canvas-store'
import {
  incrementCanvasPerfCounter,
  markCanvasPerformance,
} from '../diagnostics/canvas-performance-marks'
import { stableCanvas } from '../utils/react-flow-persistence'

interface UseWorkflowAutosaveInput {
  fallbackName?: string | undefined
  onError(error: string): void
  workflowId: string
}

interface WorkflowSaveResult {
  response: WorkflowResponse
  revision: number
}

export function useWorkflowAutosave({
  fallbackName,
  onError,
  workflowId,
}: UseWorkflowAutosaveInput) {
  const queryClient = useQueryClient()
  const draftRevision = useCanvasStore((state) => state.draftRevision)
  const remoteUpdatePending = useCanvasStore((state) => state.remoteUpdatePending)
  const savedRevision = useCanvasStore((state) => state.savedRevision)
  const saving = useCanvasStore((state) => state.saving)
  const acknowledgeSaved = useCanvasStore((state) => state.acknowledgeSaved)
  const setSaving = useCanvasStore((state) => state.setSaving)

  const saveMutation = useMutation({
    scope: { id: `workflow-save:${workflowId}` },
    mutationFn: async (): Promise<WorkflowSaveResult> => {
      const snapshot = getCanvasSnapshot()
      const canvas = stableCanvas(snapshot.nodes, snapshot.edges)
      const response = await saveWorkflow(workflowId, {
        name: snapshot.name || fallbackName,
        version: snapshot.version,
        nodes: canvas.nodes,
        edges: canvas.edges,
      })
      return { response, revision: snapshot.draftRevision }
    },
    onMutate: () => {
      incrementCanvasPerfCounter('autosaveStarts')
      markCanvasPerformance('autosave:start')
      setSaving(true)
    },
    onSettled: () => {
      markCanvasPerformance('autosave:end')
      setSaving(false)
    },
    onSuccess: ({ response, revision }) => {
      acknowledgeSaved({ revision, version: response.item.version })
      queryClient.setQueryData(workflowKeys.detail(workflowId), response)
    },
    onError: (error) =>
      onError(error instanceof Error ? error.message : 'Save failed.'),
  })

  useEffect(() => {
    if (draftRevision <= savedRevision || saving || remoteUpdatePending) {
      return
    }
    const timeout = window.setTimeout(() => saveMutation.mutate(), 700)
    return () => window.clearTimeout(timeout)
  }, [draftRevision, remoteUpdatePending, saveMutation, savedRevision, saving])

  const saveNow = useCallback(
    () => saveMutation.mutate(),
    [saveMutation],
  )

  const saveNowAsync = useCallback(
    () => saveMutation.mutateAsync(),
    [saveMutation],
  )

  return {
    saveNow,
    saveNowAsync,
    saving,
  }
}
