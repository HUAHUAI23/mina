import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { WorkflowSummary } from '@mina/contracts/modules/workflows'

import { createWorkflow, deleteWorkflow, updateWorkflow } from '../../canvas/api/workflow-list.client'
import { workflowKeys } from '../../workflow-canvas/api/workflow-keys'
import { addWorkflowToProject, getProject, removeWorkflowFromProject } from '../api/projects.client'
import { projectKeys } from '../api/project-keys'
import type { DeleteDialogState, NamingDialogState } from '../domain/project-board'

export const useProjectDetailController = (projectId: string) => {
  const queryClient = useQueryClient()
  const [deleteState, setDeleteState] = useState<DeleteDialogState | null>(null)
  const [namingState, setNamingState] = useState<NamingDialogState | null>(null)
  const projectQuery = useQuery({
    queryFn: () => getProject(projectId),
    queryKey: projectKeys.detail(projectId),
  })
  const project = projectQuery.data?.item

  const invalidateProjectDetail = () => {
    void queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) })
    void queryClient.invalidateQueries({ queryKey: projectKeys.overview() })
    void queryClient.invalidateQueries({ queryKey: workflowKeys.list() })
  }

  const removeWorkflowMutation = useMutation({
    mutationFn: (workflow: WorkflowSummary) => removeWorkflowFromProject(projectId, workflow.id),
    onSuccess: invalidateProjectDetail,
  })
  const createProjectCanvasMutation = useMutation({
    mutationFn: async (name: string) => {
      const workflow = await createWorkflow({ name, nodes: [], edges: [] })
      await addWorkflowToProject(projectId, { workflowId: workflow.item.id })
      return workflow
    },
    onSuccess: () => {
      setNamingState(null)
      invalidateProjectDetail()
    },
  })
  const renameWorkflowMutation = useMutation({
    mutationFn: (input: { workflowId: string; name: string }) => updateWorkflow(input.workflowId, { name: input.name }),
    onSuccess: () => {
      setNamingState(null)
      invalidateProjectDetail()
    },
  })
  const deleteWorkflowMutation = useMutation({
    mutationFn: (workflowId: string) => deleteWorkflow(workflowId),
    onSuccess: () => {
      setDeleteState(null)
      invalidateProjectDetail()
    },
  })

  const mutationError =
    createProjectCanvasMutation.error ??
    removeWorkflowMutation.error ??
    renameWorkflowMutation.error ??
    deleteWorkflowMutation.error
  const mutationPending =
    createProjectCanvasMutation.isPending ||
    removeWorkflowMutation.isPending ||
    renameWorkflowMutation.isPending ||
    deleteWorkflowMutation.isPending

  const submitNamingDialog = () => {
    if (!namingState || mutationPending) {
      return
    }
    const name = namingState.name.trim()
    if (!name) {
      return
    }
    if (namingState.kind === 'create-canvas') {
      createProjectCanvasMutation.mutate(name)
      return
    }
    if (namingState.kind !== 'rename-workflow') {
      return
    }
    renameWorkflowMutation.mutate({ workflowId: namingState.workflow.id, name })
  }

  const confirmDelete = () => {
    if (!deleteState || deleteState.kind !== 'workflow' || mutationPending) {
      return
    }
    deleteWorkflowMutation.mutate(deleteState.id)
  }

  const removeWorkflow = (workflow: WorkflowSummary) => {
    if (!removeWorkflowMutation.isPending) {
      removeWorkflowMutation.mutate(workflow)
    }
  }

  return {
    deleteError: deleteWorkflowMutation.error,
    deletePending: deleteWorkflowMutation.isPending,
    deleteState,
    mutationError,
    mutationPending,
    namingError: createProjectCanvasMutation.error ?? renameWorkflowMutation.error,
    namingPending: createProjectCanvasMutation.isPending || renameWorkflowMutation.isPending,
    namingState,
    project,
    projectQuery,
    closeDeleteDialog: () => setDeleteState(null),
    closeNamingDialog: () => setNamingState(null),
    confirmDelete,
    openCreateCanvasDialog: () => setNamingState({ kind: 'create-canvas', name: '' }),
    openDeleteWorkflowDialog: (workflow: WorkflowSummary) => setDeleteState({ id: workflow.id, kind: 'workflow', name: workflow.name }),
    openRenameWorkflowDialog: (workflow: WorkflowSummary) => setNamingState({ kind: 'rename-workflow', name: workflow.name, workflow }),
    removeWorkflow,
    setNamingName: (name: string) => setNamingState((state) => state ? { ...state, name } : state),
    submitNamingDialog,
  }
}
