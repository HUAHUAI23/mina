import { useCallback, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { WorkflowCollaborationCheckpointResponse } from '@mina/contracts/modules/workflows'

import { workflowKeys } from '../api/workflow-keys'
import { checkpointWorkflowCollaboration } from '../api/workflow-queries'
import { getCanvasSnapshot, useCanvasStore } from '../store/canvas-store'
import {
  incrementCanvasPerfCounter,
  markCanvasPerformance,
} from '../diagnostics/canvas-performance-marks'
import {
  getWorkflowYjsRuntimeForWorkflow,
  getWorkflowYjsStateVector,
} from '../sync/yjs/workflow-yjs-store'

interface UseWorkflowAutosaveInput {
  fallbackName?: string | undefined
  onError(error: string): void
  workflowId: string
}

interface WorkflowSaveResult {
  response: WorkflowCollaborationCheckpointResponse
}

const stateVectorsEqual = (left: Uint8Array | undefined, right: readonly number[]): boolean =>
  Boolean(left && left.length === right.length && left.every((value, index) => value === right[index]))

export function useWorkflowAutosave({
  fallbackName,
  onError,
  workflowId,
}: UseWorkflowAutosaveInput) {
  const queryClient = useQueryClient()
  const dirty = useCanvasStore((state) => state.dirty)
  const saving = useCanvasStore((state) => state.saving)
  const yjsConnectionStatus = useCanvasStore((state) => state.yjsConnectionStatus)
  const acknowledgeSaved = useCanvasStore((state) => state.acknowledgeSaved)
  const setSaving = useCanvasStore((state) => state.setSaving)

  const saveMutation = useMutation({
    scope: { id: `workflow-save:${workflowId}` },
    mutationFn: async (): Promise<WorkflowSaveResult> => {
      const snapshot = getCanvasSnapshot()
      const runtime = getWorkflowYjsRuntimeForWorkflow(workflowId)
      if (!runtime?.synced || runtime.providerStatus !== 'connected') {
        throw new Error('Workflow collaboration is not synced yet.')
      }
      return {
        response: await checkpointWorkflowCollaboration(workflowId, {
          ...(snapshot.name || fallbackName ? { name: snapshot.name || fallbackName } : {}),
        }),
      }
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
    onSuccess: ({ response }) => {
      if (!stateVectorsEqual(getWorkflowYjsStateVector(workflowId), response.yjsStateVector)) {
        return
      }
      acknowledgeSaved({ version: response.item.version })
      queryClient.setQueryData(workflowKeys.detail(workflowId), response)
    },
    onError: (error) =>
      onError(error instanceof Error ? error.message : 'Save failed.'),
  })

  useEffect(() => {
    if (!dirty || saving || yjsConnectionStatus !== 'synced') {
      return
    }
    const timeout = window.setTimeout(() => saveMutation.mutate(), 700)
    return () => window.clearTimeout(timeout)
  }, [dirty, saveMutation, saving, yjsConnectionStatus])

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
