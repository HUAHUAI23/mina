import { useEffect, useMemo, useState } from 'react'
import type { DragEndEvent, DragOverEvent, DragStartEvent, UniqueIdentifier } from '@dnd-kit/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { ProjectWithWorkflows } from '@mina/contracts/modules/projects'
import type { WorkflowSummary } from '@mina/contracts/modules/workflows'

import { createWorkflow, deleteWorkflow, updateWorkflow } from '../../canvas/api/workflow-list.client'
import { workflowKeys } from '../../workflow-canvas/api/workflow-keys'
import {
  addWorkflowToProject,
  createProject,
  createProjectFromWorkflows,
  deleteProject,
  getProjectsOverview,
  updateProject,
} from '../api/projects.client'
import { projectKeys } from '../api/project-keys'
import {
  defaultProjectName,
  dragDataFromUnknown,
  dropDataFromUnknown,
  workflowById,
} from '../domain/project-board'
import type { DeleteDialogState, NamingDialogState } from '../domain/project-board'

interface UseProjectsPageControllerInput {
  initialAction?: 'create-canvas' | undefined
}

export const useProjectsPageController = ({ initialAction }: UseProjectsPageControllerInput) => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeWorkflowId, setActiveWorkflowId] = useState<UniqueIdentifier | null>(null)
  const [deleteState, setDeleteState] = useState<DeleteDialogState | null>(null)
  const [namingState, setNamingState] = useState<NamingDialogState | null>(null)
  const [overId, setOverId] = useState<UniqueIdentifier | null>(null)
  const projectsQuery = useQuery({ queryFn: getProjectsOverview, queryKey: projectKeys.overview() })
  const projects = projectsQuery.data?.projects ?? []
  const ungroupedWorkflows = projectsQuery.data?.ungroupedWorkflows ?? []
  const ungroupedWorkflowIds = useMemo(
    () => new Set(ungroupedWorkflows.map((workflow) => workflow.id)),
    [ungroupedWorkflows],
  )
  const recentWorkflows = useMemo(
    () =>
      [...ungroupedWorkflows, ...projects.flatMap((project) => project.workflows)]
        .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
        .slice(0, 6),
    [projects, ungroupedWorkflows],
  )
  const activeWorkflow = activeWorkflowId ? workflowById(projects, ungroupedWorkflows, activeWorkflowId) : undefined

  useEffect(() => {
    if (initialAction !== 'create-canvas') {
      return
    }
    setNamingState((state) => state ?? { kind: 'create-canvas', name: '' })
    void navigate({ replace: true, search: {}, to: '/projects' })
  }, [initialAction, navigate])

  const invalidateProjectLists = () => {
    void queryClient.invalidateQueries({ queryKey: projectKeys.overview() })
    void queryClient.invalidateQueries({ queryKey: workflowKeys.list() })
  }

  const createCanvasMutation = useMutation({
    mutationFn: (name: string) => createWorkflow({ name, nodes: [], edges: [] }),
    onSuccess: (response) => {
      setNamingState(null)
      invalidateProjectLists()
      void navigate({ to: '/canvas/$workflowId', params: { workflowId: response.item.id } })
    },
  })
  const createEmptyProjectMutation = useMutation({
    mutationFn: (name: string) => createProject({ name, workflowIds: [] }),
    onSuccess: (response) => {
      setNamingState(null)
      invalidateProjectLists()
      void navigate({ to: '/projects/$projectId', params: { projectId: response.item.id } })
    },
  })
  const createProjectMutation = useMutation({
    mutationFn: (input: { name: string; source: WorkflowSummary; target: WorkflowSummary }) =>
      createProjectFromWorkflows({
        name: input.name,
        sourceWorkflowId: input.source.id,
        targetWorkflowId: input.target.id,
      }),
    onSuccess: () => {
      setNamingState(null)
      invalidateProjectLists()
    },
  })
  const addWorkflowMutation = useMutation({
    mutationFn: (input: { projectId: string; workflow: WorkflowSummary }) =>
      addWorkflowToProject(input.projectId, { workflowId: input.workflow.id }),
    onSuccess: (_response, input) => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.detail(input.projectId) })
      invalidateProjectLists()
    },
  })
  const renameProjectMutation = useMutation({
    mutationFn: (input: { projectId: string; name: string }) => updateProject(input.projectId, { name: input.name }),
    onSuccess: (_response, input) => {
      setNamingState(null)
      void queryClient.invalidateQueries({ queryKey: projectKeys.detail(input.projectId) })
      void queryClient.invalidateQueries({ queryKey: projectKeys.overview() })
    },
  })
  const renameWorkflowMutation = useMutation({
    mutationFn: (input: { workflowId: string; name: string }) => updateWorkflow(input.workflowId, { name: input.name }),
    onSuccess: () => {
      setNamingState(null)
      invalidateProjectLists()
    },
  })
  const deleteProjectMutation = useMutation({
    mutationFn: (projectId: string) => deleteProject(projectId),
    onSuccess: () => {
      setDeleteState(null)
      invalidateProjectLists()
    },
  })
  const deleteWorkflowMutation = useMutation({
    mutationFn: (workflowId: string) => deleteWorkflow(workflowId),
    onSuccess: () => {
      setDeleteState(null)
      invalidateProjectLists()
    },
  })

  const mutationError =
    createProjectMutation.error ??
    createEmptyProjectMutation.error ??
    createCanvasMutation.error ??
    addWorkflowMutation.error ??
    renameProjectMutation.error ??
    renameWorkflowMutation.error ??
    deleteProjectMutation.error ??
    deleteWorkflowMutation.error
  const mutationPending =
    createProjectMutation.isPending ||
    createEmptyProjectMutation.isPending ||
    createCanvasMutation.isPending ||
    addWorkflowMutation.isPending ||
    renameProjectMutation.isPending ||
    renameWorkflowMutation.isPending ||
    deleteProjectMutation.isPending ||
    deleteWorkflowMutation.isPending

  const handleCreateProjectWith = (source: WorkflowSummary, target: WorkflowSummary) => {
    if (source.id === target.id || mutationPending) {
      return
    }
    setNamingState({
      kind: 'create-project',
      name: defaultProjectName(source, target),
      source,
      target,
    })
  }

  const addWorkflowToExistingProject = (projectId: string, workflow: WorkflowSummary) => {
    if (mutationPending) {
      return
    }
    addWorkflowMutation.mutate({ projectId, workflow })
  }

  const submitNamingDialog = () => {
    if (!namingState || mutationPending) {
      return
    }
    const name = namingState.name.trim()
    if (!name) {
      return
    }
    if (namingState.kind === 'create-canvas') {
      createCanvasMutation.mutate(name)
      return
    }
    if (namingState.kind === 'create-empty-project') {
      createEmptyProjectMutation.mutate(name)
      return
    }
    if (namingState.kind === 'create-project') {
      createProjectMutation.mutate({ name, source: namingState.source, target: namingState.target })
      return
    }
    if (namingState.kind === 'rename-project') {
      renameProjectMutation.mutate({ projectId: namingState.project.id, name })
      return
    }
    renameWorkflowMutation.mutate({ workflowId: namingState.workflow.id, name })
  }

  const confirmDelete = () => {
    if (!deleteState || mutationPending) {
      return
    }
    if (deleteState.kind === 'project') {
      deleteProjectMutation.mutate(deleteState.id)
      return
    }
    deleteWorkflowMutation.mutate(deleteState.id)
  }

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveWorkflowId(active.id)
  }

  const handleDragOver = ({ over }: DragOverEvent) => {
    setOverId(over?.id ?? null)
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveWorkflowId(null)
    setOverId(null)
    const source = dragDataFromUnknown(active.data.current)?.workflow
    const drop = dropDataFromUnknown(over?.data.current)
    if (!source || !drop || mutationPending) {
      return
    }
    if (drop.type === 'project') {
      addWorkflowToExistingProject(drop.project.id, source)
      return
    }
    if (source.id === drop.workflow.id) {
      return
    }
    handleCreateProjectWith(source, drop.workflow)
  }

  const handleDragCancel = () => {
    setActiveWorkflowId(null)
    setOverId(null)
  }

  return {
    activeWorkflow,
    createEmptyProjectPending: createEmptyProjectMutation.isPending,
    deleteError: deleteProjectMutation.error ?? deleteWorkflowMutation.error,
    deletePending: deleteProjectMutation.isPending || deleteWorkflowMutation.isPending,
    deleteState,
    mutationError,
    mutationPending,
    namingError: createCanvasMutation.error ?? createEmptyProjectMutation.error ?? createProjectMutation.error ?? renameProjectMutation.error ?? renameWorkflowMutation.error,
    namingPending: createCanvasMutation.isPending || createEmptyProjectMutation.isPending || createProjectMutation.isPending || renameProjectMutation.isPending || renameWorkflowMutation.isPending,
    namingState,
    overId,
    projects,
    projectsQuery,
    recentWorkflows,
    ungroupedWorkflowIds,
    ungroupedWorkflows,
    addWorkflowToExistingProject,
    closeDeleteDialog: () => setDeleteState(null),
    closeNamingDialog: () => setNamingState(null),
    confirmDelete,
    handleDragCancel,
    handleDragEnd,
    handleDragOver,
    handleDragStart,
    openCreateCanvasDialog: () => setNamingState({ kind: 'create-canvas', name: '' }),
    openCreateProjectDialog: () => setNamingState({ kind: 'create-empty-project', name: '' }),
    openDeleteProjectDialog: (project: ProjectWithWorkflows) => setDeleteState({ id: project.id, kind: 'project', name: project.name }),
    openDeleteWorkflowDialog: (workflow: WorkflowSummary) => setDeleteState({ id: workflow.id, kind: 'workflow', name: workflow.name }),
    openRenameProjectDialog: (project: ProjectWithWorkflows) => setNamingState({ kind: 'rename-project', name: project.name, project }),
    openRenameWorkflowDialog: (workflow: WorkflowSummary) => setNamingState({ kind: 'rename-workflow', name: workflow.name, workflow }),
    setNamingName: (name: string) => setNamingState((state) => state ? { ...state, name } : state),
    submitNamingDialog,
  }
}
