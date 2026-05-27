import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, DragEvent, FormEvent, ReactNode } from 'react'
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragCancelEvent, DragEndEvent, DragOverEvent, DragStartEvent, UniqueIdentifier } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { formatDateTime } from '@mina/i18n'
import type { ProjectWithWorkflows } from '@mina/contracts/modules/projects'
import type { WorkflowSummary } from '@mina/contracts/modules/workflows'
import {
  ArrowLeft,
  CirclePlus,
  Folder,
  FolderMinus,
  Layers,
  MoreVertical,
  Pencil,
  Trash2,
} from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@mina/ui/components/alert-dialog'
import { Button } from '@mina/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@mina/ui/components/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@mina/ui/components/dropdown-menu'
import { Input } from '@mina/ui/components/input'
import { cn } from '@mina/ui/lib/utils'

import '../projects-page.css'
import { useI18n, useMessages } from '../../../app/i18n-provider'
import { createWorkflow, deleteWorkflow, updateWorkflow } from '../../canvas/api/workflow-list.client'
import { workflowKeys } from '../../workflow-canvas/api/workflow-keys'
import type { WebMessages } from '../../../lib/i18n-messages'
import { getErrorMessage } from '../../../lib/http'
import {
  addWorkflowToProject,
  createProjectFromWorkflows,
  deleteProject,
  getProject,
  getProjectsOverview,
  removeWorkflowFromProject,
  updateProject,
} from '../api/projects.client'
import { projectKeys } from '../api/project-keys'

type DragData = {
  type: 'workflow'
  workflow: WorkflowSummary
}

type DropData =
  | {
      type: 'project'
      project: ProjectWithWorkflows
    }
  | {
      type: 'workflow'
      workflow: WorkflowSummary
    }

const pageClassName = 'grid min-h-0 min-w-0 content-start gap-[22px] overflow-y-auto [scrollbar-gutter:stable] px-1 py-[clamp(18px,3dvh,32px)] pb-[18px]'
const sectionClassName = 'grid gap-4'
const detailTitleGroupClassName = 'flex min-w-0 items-center gap-3'
const backLinkClassName = 'flex size-10 flex-none items-center justify-center rounded-full bg-surface-container-lowest text-foreground-tertiary shadow-[inset_0_0_0_1px_var(--outline-ghost)] hover:bg-foreground hover:text-primary-foreground'
const projectGridClassName = 'grid items-start justify-start gap-[26px] [grid-template-columns:repeat(auto-fill,178px)] max-lg:[grid-template-columns:repeat(auto-fill,minmax(164px,1fr))] max-md:grid-cols-1'
const folderCardClassName = 'relative z-0 flex h-[252px] min-w-0 flex-col justify-between rounded-2xl bg-surface-container-low p-5 shadow-sm'
const canvasCardClassName = 'h-[252px] min-w-0 overflow-visible rounded-2xl bg-surface-container-lowest shadow-floating'
const newCanvasCardClassName = 'flex min-h-[252px] min-w-0 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-outline-ghost bg-transparent font-extrabold text-foreground-tertiary hover:border-foreground-quaternary hover:text-foreground disabled:cursor-not-allowed disabled:text-foreground-quaternary'
const iconButtonClassName = 'size-8.5 rounded-full text-foreground-quaternary hover:bg-surface-container-low hover:text-foreground'
const activeDropClassName = 'ring-2 ring-foreground/35 ring-offset-2 ring-offset-surface'
const overlayClassName = 'w-[178px] overflow-hidden rounded-2xl bg-surface-container-lowest shadow-floating ring-2 ring-foreground/20'
const canvasPreviewPillClassName = 'relative z-10 m-3 inline-flex rounded-full bg-surface-container-lowest/80 px-2.5 py-1 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-foreground-tertiary'
const dialogInputClassName = 'h-10 bg-surface-container-lowest'
const preventNativeLinkDrag = (event: DragEvent<HTMLAnchorElement>) => event.preventDefault()

type OverviewGridItem =
  | {
      project: ProjectWithWorkflows
      type: 'project'
    }
  | {
      type: 'workflow'
      workflow: WorkflowSummary
    }

type NamingDialogState =
  | {
      kind: 'create-canvas'
      name: string
    }
  | {
      kind: 'create-project'
      name: string
      source: WorkflowSummary
      target: WorkflowSummary
    }
  | {
      kind: 'rename-project'
      name: string
      project: ProjectWithWorkflows
    }
  | {
      kind: 'rename-workflow'
      name: string
      workflow: WorkflowSummary
    }

const draggableId = (workflowId: string): string => `workflow:${workflowId}`
const projectDropId = (projectId: string): string => `project:${projectId}`

const dragDataFromUnknown = (value: unknown): DragData | undefined => {
  if (!value || typeof value !== 'object' || !('type' in value) || value.type !== 'workflow' || !('workflow' in value)) {
    return undefined
  }
  return value as DragData
}

const dropDataFromUnknown = (value: unknown): DropData | undefined => {
  if (!value || typeof value !== 'object' || !('type' in value)) {
    return undefined
  }
  if (value.type === 'project' && 'project' in value) {
    return value as DropData
  }
  if (value.type === 'workflow' && 'workflow' in value) {
    return value as DropData
  }
  return undefined
}

const workflowById = (
  projects: ProjectWithWorkflows[],
  ungroupedWorkflows: WorkflowSummary[],
  workflowId: UniqueIdentifier,
): WorkflowSummary | undefined => {
  const id = String(workflowId).replace(/^workflow:/, '')
  return [...ungroupedWorkflows, ...projects.flatMap((project) => project.workflows)].find((workflow) => workflow.id === id)
}

const defaultProjectName = (source: WorkflowSummary, target: WorkflowSummary): string =>
  `${target.name} + ${source.name}`.slice(0, 120)

const createAnnouncements = (m: WebMessages) => ({
  onDragCancel({ active }: DragCancelEvent) {
    const workflow = dragDataFromUnknown(active.data.current)?.workflow
    return workflow ? m.projects_drag_cancel() : undefined
  },
  onDragEnd({ active, over }: DragEndEvent) {
    const workflow = dragDataFromUnknown(active.data.current)?.workflow
    const drop = dropDataFromUnknown(over?.data.current)
    if (!workflow || !drop) {
      return m.projects_drag_cancel()
    }
    if (drop.type === 'project') {
      return m.projects_drag_end_project({ title: workflow.name, project: drop.project.name })
    }
    if (workflow.id === drop.workflow.id) {
      return m.projects_drag_cancel()
    }
    return m.projects_drag_end_canvas({ source: workflow.name, target: drop.workflow.name })
  },
  onDragOver({ active, over }: DragOverEvent) {
    const workflow = dragDataFromUnknown(active.data.current)?.workflow
    const drop = dropDataFromUnknown(over?.data.current)
    if (!workflow || !drop) {
      return undefined
    }
    if (drop.type === 'project') {
      return m.projects_drag_over_project({ title: workflow.name, project: drop.project.name })
    }
    if (workflow.id === drop.workflow.id) {
      return undefined
    }
    return m.projects_drag_over_canvas({ source: workflow.name, target: drop.workflow.name })
  },
  onDragStart({ active }: DragStartEvent) {
    const workflow = dragDataFromUnknown(active.data.current)?.workflow
    return workflow ? m.projects_drag_start({ title: workflow.name }) : undefined
  },
})

interface ProjectCardProps {
  isOver: boolean
  m: WebMessages
  project: ProjectWithWorkflows
  onDelete(project: ProjectWithWorkflows): void
  onRename(project: ProjectWithWorkflows): void
}

function ProjectCard({ isOver, m, onDelete, onRename, project }: ProjectCardProps) {
  const { setNodeRef } = useDroppable({
    data: {
      project,
      type: 'project',
    } satisfies DropData,
    id: projectDropId(project.id),
  })

  return (
    <article
      className={cn(folderCardClassName, isOver && activeDropClassName)}
      ref={setNodeRef}
    >
      <div className="absolute inset-x-3.5 -top-2 -z-10 h-7 rounded-2xl bg-surface-container-high" aria-hidden="true" />
      <Link
        aria-label={m.projects_open_project({ title: project.name })}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:ring-2 focus-visible:ring-foreground/35 focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none"
        draggable={false}
        onDragStart={preventNativeLinkDrag}
        params={{ projectId: project.id }}
        to="/projects/$projectId"
      />
      <div
        className="mina-project-folder-icon flex size-10.5 items-center justify-center rounded-xl bg-surface-container-lowest text-foreground-tertiary"
        data-accent={project.workflows.length > 3 ? 'cool' : 'soft'}
      >
        <Folder aria-hidden="true" size={26} fill="currentColor" strokeWidth={1.6} />
      </div>
      <div className="grid gap-2 text-left">
        <h2 className="font-display m-0 text-[0.96rem] leading-[1.18] text-foreground">{project.name}</h2>
        <div className="relative z-20 flex items-center justify-between gap-2">
          <p className="mt-0 flex items-center gap-1.5 text-[0.66rem] uppercase text-foreground-tertiary">
            <Layers aria-hidden="true" size={14} />
            {m.projects_canvas_count({ count: project.workflows.length })}
          </p>
          <ResourceActions
            deleteLabel={m.projects_delete_project()}
            editLabel={m.projects_rename_project()}
            menuLabel={m.projects_more_actions({ title: project.name })}
            onDelete={() => onDelete(project)}
            onRename={() => onRename(project)}
          />
        </div>
      </div>
    </article>
  )
}

interface WorkflowCardProps {
  actionSlot?: ReactNode
  isOver?: boolean
  locale: ReturnType<typeof useI18n>['locale']
  m: WebMessages
  overlay?: boolean
  workflow: WorkflowSummary
  onDelete?(workflow: WorkflowSummary): void
  onRemoveFromProject?: ((workflow: WorkflowSummary) => void) | undefined
  onRename?(workflow: WorkflowSummary): void
}

function WorkflowCard({
  actionSlot,
  isOver = false,
  locale,
  m,
  overlay = false,
  workflow,
  onDelete,
  onRemoveFromProject,
  onRename,
}: WorkflowCardProps) {
  const { setNodeRef: setDroppableNodeRef } = useDroppable({
    data: {
      type: 'workflow',
      workflow,
    } satisfies DropData,
    disabled: overlay,
    id: draggableId(workflow.id),
  })

  return (
    <article
      className={cn(canvasCardClassName, isOver && activeDropClassName, overlay && overlayClassName)}
      ref={overlay ? undefined : setDroppableNodeRef}
    >
      <Link
        aria-label={m.projects_open_canvas({ title: workflow.name })}
        draggable={false}
        onDragStart={preventNativeLinkDrag}
        params={{ workflowId: workflow.id }}
        to="/canvas/$workflowId"
      >
        <div className="mina-project-preview relative min-h-[158px] overflow-hidden" aria-label={m.projects_canvas_preview_label()}>
          <span className={canvasPreviewPillClassName}>{m.workflow_canvas_eyebrow()}</span>
        </div>
      </Link>
      <div className="flex items-start justify-between gap-2 p-4">
        <Link
          aria-label={m.projects_open_canvas({ title: workflow.name })}
          className="grid min-w-0 gap-2 text-left"
          draggable={false}
          onDragStart={preventNativeLinkDrag}
          params={{ workflowId: workflow.id }}
          to="/canvas/$workflowId"
        >
          <h2 className="font-display m-0 truncate text-[0.96rem] leading-[1.18] text-foreground">{workflow.name}</h2>
          <p className="m-0 truncate text-[0.66rem] uppercase text-foreground-tertiary">
            {m.projects_updated_at({ date: formatDateTime(workflow.updatedAt, locale) })}
          </p>
        </Link>
        {overlay ? null : actionSlot ?? (
          <ResourceActions
            deleteLabel={m.projects_delete_canvas()}
            editLabel={m.projects_rename_canvas()}
            menuLabel={m.projects_more_actions({ title: workflow.name })}
            onDelete={onDelete ? () => onDelete(workflow) : undefined}
            onRemoveFromProject={onRemoveFromProject ? () => onRemoveFromProject(workflow) : undefined}
            onRename={onRename ? () => onRename(workflow) : undefined}
            removeFromProjectLabel={m.projects_remove_from_project()}
          />
        )}
      </div>
    </article>
  )
}

interface DraggableWorkflowCardProps extends Omit<WorkflowCardProps, 'actionSlot' | 'overlay'> {
  disabled?: boolean
}

function DraggableWorkflowCard(props: DraggableWorkflowCardProps) {
  const { attributes, isDragging, listeners, setNodeRef, transform } = useDraggable({
    data: {
      type: 'workflow',
      workflow: props.workflow,
    } satisfies DragData,
    disabled: props.disabled ?? false,
    id: draggableId(props.workflow.id),
  })
  const style = {
    transform: CSS.Translate.toString(transform),
  } satisfies CSSProperties

  return (
    <div
      className={cn('min-w-0 cursor-grab active:cursor-grabbing', isDragging && 'relative z-20')}
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
    >
      <WorkflowCard
        {...props}
        actionSlot={(
          <div
            className="flex flex-none items-center gap-1"
            onKeyDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <ResourceActions
              deleteLabel={props.m.projects_delete_canvas()}
              editLabel={props.m.projects_rename_canvas()}
              menuLabel={props.m.projects_more_actions({ title: props.workflow.name })}
              onDelete={props.onDelete ? () => props.onDelete?.(props.workflow) : undefined}
              onRemoveFromProject={props.onRemoveFromProject ? () => props.onRemoveFromProject?.(props.workflow) : undefined}
              onRename={props.onRename ? () => props.onRename?.(props.workflow) : undefined}
              removeFromProjectLabel={props.m.projects_remove_from_project()}
            />
            <span className="sr-only">{props.m.projects_drag_instruction()}</span>
          </div>
        )}
      />
    </div>
  )
}

interface ResourceActionsProps {
  deleteLabel: string
  editLabel: string
  menuLabel: string
  removeFromProjectLabel?: string
  onDelete?: (() => void) | undefined
  onRemoveFromProject?: (() => void) | undefined
  onRename?: (() => void) | undefined
}

function ResourceActions({
  deleteLabel,
  editLabel,
  menuLabel,
  onDelete,
  onRemoveFromProject,
  onRename,
  removeFromProjectLabel,
}: ResourceActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label={menuLabel} className={iconButtonClassName} size="icon-sm" type="button" variant="ghost">
          <MoreVertical aria-hidden="true" size={18} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        {onRename ? (
          <DropdownMenuItem onClick={onRename}>
            <Pencil aria-hidden="true" size={15} />
            {editLabel}
          </DropdownMenuItem>
        ) : null}
        {onRemoveFromProject && removeFromProjectLabel ? (
          <DropdownMenuItem onClick={onRemoveFromProject}>
            <FolderMinus aria-hidden="true" size={15} />
            {removeFromProjectLabel}
          </DropdownMenuItem>
        ) : null}
        {onDelete ? (
          <DropdownMenuItem onClick={onDelete} variant="destructive">
            <Trash2 aria-hidden="true" size={15} />
            {deleteLabel}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface NamingDialogProps {
  error?: unknown
  m: WebMessages
  pending: boolean
  state: NamingDialogState | null
  onChangeName(name: string): void
  onClose(): void
  onSubmit(): void
}

function namingDialogCopy(m: WebMessages, state: NamingDialogState) {
  if (state.kind === 'create-canvas') {
    return {
      description: m.projects_name_canvas_description(),
      submit: m.projects_create_canvas_submit(),
      title: m.projects_name_canvas_title(),
    }
  }
  if (state.kind === 'create-project') {
    return {
      description: m.projects_name_project_description(),
      submit: m.projects_create_project_submit(),
      title: m.projects_name_project_title(),
    }
  }
  if (state.kind === 'rename-project') {
    return {
      description: m.projects_rename_project_description(),
      submit: m.projects_save_name(),
      title: m.projects_rename_project_title(),
    }
  }
  return {
    description: m.projects_rename_canvas_description(),
    submit: m.projects_save_name(),
    title: m.projects_rename_canvas_title(),
  }
}

function NamingDialog({ error, m, onChangeName, onClose, onSubmit, pending, state }: NamingDialogProps) {
  const copy = state ? namingDialogCopy(m, state) : undefined

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit()
  }

  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => {
      if (!open && !pending) {
        onClose()
      }
    }}>
      <DialogContent className="bg-surface-container-lowest">
        {state && copy ? (
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{copy.title}</DialogTitle>
              <DialogDescription>{copy.description}</DialogDescription>
            </DialogHeader>
            <Input
              autoFocus
              className={dialogInputClassName}
              maxLength={120}
              onChange={(event) => onChangeName(event.target.value)}
              required
              value={state.name}
            />
            {error ? (
              <p className="m-0 text-[0.76rem] font-bold text-destructive" role="status">
                {getErrorMessage(error, m.projects_mutation_failed())}
              </p>
            ) : null}
            <DialogFooter>
              <Button disabled={pending} onClick={onClose} type="button" variant="outline">
                {m.projects_cancel()}
              </Button>
              <Button disabled={pending || state.name.trim().length === 0} type="submit">
                {copy.submit}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

interface DeleteDialogState {
  kind: 'project' | 'workflow'
  name: string
  id: string
}

interface DeleteResourceDialogProps {
  error?: unknown
  m: WebMessages
  pending: boolean
  state: DeleteDialogState | null
  onClose(): void
  onConfirm(): void
}

function DeleteResourceDialog({ error, m, onClose, onConfirm, pending, state }: DeleteResourceDialogProps) {
  return (
    <AlertDialog open={Boolean(state)} onOpenChange={(open) => {
      if (!open && !pending) {
        onClose()
      }
    }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {state?.kind === 'project' ? m.projects_delete_project_title() : m.projects_delete_canvas_title()}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {state
              ? state.kind === 'project'
                ? m.projects_delete_project_description({ title: state.name })
                : m.projects_delete_canvas_description({ title: state.name })
              : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p className="m-0 text-[0.76rem] font-bold text-destructive" role="status">
            {getErrorMessage(error, m.projects_mutation_failed())}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{m.projects_cancel()}</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={(event) => {
            event.preventDefault()
            onConfirm()
          }} variant="destructive">
            {m.projects_delete_confirm()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface ProjectsPageProps {
  initialAction?: 'create-canvas' | undefined
}

export function ProjectsPage({ initialAction }: ProjectsPageProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { locale } = useI18n()
  const m = useMessages()
  const [activeWorkflowId, setActiveWorkflowId] = useState<UniqueIdentifier | null>(null)
  const [deleteState, setDeleteState] = useState<DeleteDialogState | null>(null)
  const [namingState, setNamingState] = useState<NamingDialogState | null>(null)
  const [overId, setOverId] = useState<UniqueIdentifier | null>(null)
  const projectsQuery = useQuery({ queryFn: getProjectsOverview, queryKey: projectKeys.overview() })
  const projects = projectsQuery.data?.projects ?? []
  const ungroupedWorkflows = projectsQuery.data?.ungroupedWorkflows ?? []
  const overviewItems = useMemo<OverviewGridItem[]>(
    () => [
      ...projects.map((project) => ({ project, type: 'project' as const })),
      ...ungroupedWorkflows.map((workflow) => ({ type: 'workflow' as const, workflow })),
    ],
    [projects, ungroupedWorkflows],
  )
  const activeWorkflow = activeWorkflowId ? workflowById(projects, ungroupedWorkflows, activeWorkflowId) : undefined
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  )

  useEffect(() => {
    if (initialAction !== 'create-canvas') {
      return
    }
    setNamingState((state) => state ?? { kind: 'create-canvas', name: '' })
    void navigate({ replace: true, search: {}, to: '/projects' })
  }, [initialAction, navigate])

  const createCanvasMutation = useMutation({
    mutationFn: (name: string) => createWorkflow({ name, nodes: [], edges: [] }),
    onSuccess: (response) => {
      setNamingState(null)
      void queryClient.invalidateQueries({ queryKey: projectKeys.overview() })
      void queryClient.invalidateQueries({ queryKey: workflowKeys.list() })
      void navigate({ to: '/canvas/$workflowId', params: { workflowId: response.item.id } })
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
      void queryClient.invalidateQueries({ queryKey: projectKeys.overview() })
      void queryClient.invalidateQueries({ queryKey: workflowKeys.list() })
    },
  })
  const addWorkflowMutation = useMutation({
    mutationFn: (input: { projectId: string; workflow: WorkflowSummary }) =>
      addWorkflowToProject(input.projectId, { workflowId: input.workflow.id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.overview() })
      void queryClient.invalidateQueries({ queryKey: workflowKeys.list() })
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
      void queryClient.invalidateQueries({ queryKey: projectKeys.overview() })
      void queryClient.invalidateQueries({ queryKey: workflowKeys.list() })
    },
  })
  const deleteProjectMutation = useMutation({
    mutationFn: (projectId: string) => deleteProject(projectId),
    onSuccess: () => {
      setDeleteState(null)
      void queryClient.invalidateQueries({ queryKey: projectKeys.overview() })
      void queryClient.invalidateQueries({ queryKey: workflowKeys.list() })
    },
  })
  const deleteWorkflowMutation = useMutation({
    mutationFn: (workflowId: string) => deleteWorkflow(workflowId),
    onSuccess: () => {
      setDeleteState(null)
      void queryClient.invalidateQueries({ queryKey: projectKeys.overview() })
      void queryClient.invalidateQueries({ queryKey: workflowKeys.list() })
    },
  })
  const mutationError =
    createProjectMutation.error ??
    addWorkflowMutation.error ??
    createCanvasMutation.error ??
    renameProjectMutation.error ??
    renameWorkflowMutation.error ??
    deleteProjectMutation.error ??
    deleteWorkflowMutation.error
  const mutationPending =
    createProjectMutation.isPending ||
    addWorkflowMutation.isPending ||
    createCanvasMutation.isPending ||
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

  const handleAddToProject = (projectId: string, workflow: WorkflowSummary) => {
    if (mutationPending) {
      return
    }
    addWorkflowMutation.mutate({ projectId, workflow })
  }

  const handleNamingSubmit = () => {
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

  const handleDeleteConfirm = () => {
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
      handleAddToProject(drop.project.id, source)
      return
    }
    handleCreateProjectWith(source, drop.workflow)
  }

  const handleDragCancel = () => {
    setActiveWorkflowId(null)
    setOverId(null)
  }

  return (
    <div className={pageClassName}>
      <DndContext
        accessibility={{
          announcements: createAnnouncements(m),
          screenReaderInstructions: {
            draggable: m.projects_drag_instruction(),
          },
        }}
        autoScroll={false}
        collisionDetection={closestCenter}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragStart={handleDragStart}
        sensors={sensors}
      >
        <div className={sectionClassName}>
          <div className={projectGridClassName}>
            {overviewItems.map((item) =>
              item.type === 'project' ? (
                <ProjectCard
                  isOver={overId === projectDropId(item.project.id)}
                  key={item.project.id}
                  m={m}
                  onDelete={(project) => setDeleteState({ id: project.id, kind: 'project', name: project.name })}
                  onRename={(project) => setNamingState({ kind: 'rename-project', name: project.name, project })}
                  project={item.project}
                />
              ) : (
                <DraggableWorkflowCard
                  disabled={mutationPending}
                  isOver={overId === draggableId(item.workflow.id)}
                  key={item.workflow.id}
                  locale={locale}
                  m={m}
                  onDelete={(workflow) => setDeleteState({ id: workflow.id, kind: 'workflow', name: workflow.name })}
                  onRename={(workflow) => setNamingState({ kind: 'rename-workflow', name: workflow.name, workflow })}
                  workflow={item.workflow}
                />
              ),
            )}
            <button
              className={newCanvasCardClassName}
              disabled={createCanvasMutation.isPending}
              onClick={() => setNamingState({ kind: 'create-canvas', name: '' })}
              type="button"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-container-lowest">
                <CirclePlus aria-hidden="true" size={24} />
              </span>
              {m.projects_new_canvas()}
            </button>
            {!projectsQuery.isLoading && projects.length === 0 && ungroupedWorkflows.length === 0 ? (
              <div className="grid min-h-[252px] content-center gap-2 rounded-2xl border border-outline-ghost bg-surface-container-lowest p-5 text-foreground-tertiary">
                <h2 className="font-display m-0 text-[0.96rem] leading-[1.18] text-foreground">{m.projects_empty_title()}</h2>
                <p className="m-0 text-[0.78rem] leading-relaxed">{m.projects_empty_body()}</p>
              </div>
            ) : null}
          </div>
        </div>

        {mutationError ? (
          <p className="m-0 text-[0.76rem] font-bold text-destructive" role="status">
            {getErrorMessage(mutationError, m.projects_mutation_failed())}
          </p>
        ) : null}

        <DragOverlay dropAnimation={null}>
          {activeWorkflow ? (
            <WorkflowCard
              locale={locale}
              m={m}
              overlay
              workflow={activeWorkflow}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
      <NamingDialog
        error={createCanvasMutation.error ?? createProjectMutation.error ?? renameProjectMutation.error ?? renameWorkflowMutation.error}
        m={m}
        onChangeName={(name) => setNamingState((state) => state ? { ...state, name } : state)}
        onClose={() => setNamingState(null)}
        onSubmit={handleNamingSubmit}
        pending={createCanvasMutation.isPending || createProjectMutation.isPending || renameProjectMutation.isPending || renameWorkflowMutation.isPending}
        state={namingState}
      />
      <DeleteResourceDialog
        error={deleteProjectMutation.error ?? deleteWorkflowMutation.error}
        m={m}
        onClose={() => setDeleteState(null)}
        onConfirm={handleDeleteConfirm}
        pending={deleteProjectMutation.isPending || deleteWorkflowMutation.isPending}
        state={deleteState}
      />
    </div>
  )
}

interface ProjectDetailPageProps {
  projectId: string
}

export function ProjectDetailPage({ projectId }: ProjectDetailPageProps) {
  const queryClient = useQueryClient()
  const { locale } = useI18n()
  const m = useMessages()
  const [deleteState, setDeleteState] = useState<DeleteDialogState | null>(null)
  const [namingState, setNamingState] = useState<NamingDialogState | null>(null)
  const projectQuery = useQuery({
    queryFn: () => getProject(projectId),
    queryKey: projectKeys.detail(projectId),
  })
  const project = projectQuery.data?.item

  const removeWorkflowMutation = useMutation({
    mutationFn: (workflow: WorkflowSummary) => removeWorkflowFromProject(projectId, workflow.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) })
      void queryClient.invalidateQueries({ queryKey: projectKeys.overview() })
      void queryClient.invalidateQueries({ queryKey: workflowKeys.list() })
    },
  })
  const renameWorkflowMutation = useMutation({
    mutationFn: (input: { workflowId: string; name: string }) => updateWorkflow(input.workflowId, { name: input.name }),
    onSuccess: () => {
      setNamingState(null)
      void queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) })
      void queryClient.invalidateQueries({ queryKey: projectKeys.overview() })
      void queryClient.invalidateQueries({ queryKey: workflowKeys.list() })
    },
  })
  const deleteWorkflowMutation = useMutation({
    mutationFn: (workflowId: string) => deleteWorkflow(workflowId),
    onSuccess: () => {
      setDeleteState(null)
      void queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) })
      void queryClient.invalidateQueries({ queryKey: projectKeys.overview() })
      void queryClient.invalidateQueries({ queryKey: workflowKeys.list() })
    },
  })
  const mutationError = removeWorkflowMutation.error ?? renameWorkflowMutation.error ?? deleteWorkflowMutation.error
  const mutationPending = removeWorkflowMutation.isPending || renameWorkflowMutation.isPending || deleteWorkflowMutation.isPending

  const handleNamingSubmit = () => {
    if (!namingState || namingState.kind !== 'rename-workflow' || mutationPending) {
      return
    }
    const name = namingState.name.trim()
    if (!name) {
      return
    }
    renameWorkflowMutation.mutate({ workflowId: namingState.workflow.id, name })
  }

  const handleDeleteConfirm = () => {
    if (!deleteState || deleteState.kind !== 'workflow' || mutationPending) {
      return
    }
    deleteWorkflowMutation.mutate(deleteState.id)
  }

  if (projectQuery.isLoading) {
    return (
      <div className={pageClassName}>
        <p className="m-0 text-[0.76rem] font-bold text-foreground-quaternary" role="status">
          {m.projects_loading_project()}
        </p>
      </div>
    )
  }

  if (projectQuery.isError || !project) {
    return (
      <div className={pageClassName}>
        <div className={detailTitleGroupClassName}>
          <Link aria-label={m.projects_back_to_projects()} className={backLinkClassName} to="/projects">
            <ArrowLeft aria-hidden="true" size={17} />
          </Link>
          <p className="m-0 text-[0.76rem] font-bold text-destructive" role="status">
            {getErrorMessage(projectQuery.error, m.projects_project_unavailable())}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={pageClassName}>
      <Link aria-label={m.projects_back_to_projects()} className={backLinkClassName} to="/projects">
        <ArrowLeft aria-hidden="true" size={17} />
      </Link>

      <div className={sectionClassName}>
        <div className={projectGridClassName}>
          {project.workflows.map((workflow) => (
            <WorkflowCard
              key={workflow.id}
              locale={locale}
              m={m}
              onDelete={(item) => setDeleteState({ id: item.id, kind: 'workflow', name: item.name })}
              onRemoveFromProject={(item) => {
                if (!removeWorkflowMutation.isPending) {
                  removeWorkflowMutation.mutate(item)
                }
              }}
              onRename={(item) => setNamingState({ kind: 'rename-workflow', name: item.name, workflow: item })}
              workflow={workflow}
            />
          ))}
          {project.workflows.length === 0 ? (
            <div className="grid min-h-[252px] content-center gap-2 rounded-2xl border border-outline-ghost bg-surface-container-lowest p-5 text-foreground-tertiary">
              <h2 className="font-display m-0 text-[0.96rem] leading-[1.18] text-foreground">{m.projects_empty_project_title()}</h2>
              <p className="m-0 text-[0.78rem] leading-relaxed">{m.projects_empty_project_body()}</p>
            </div>
          ) : null}
        </div>
      </div>

      {mutationError ? (
        <p className="m-0 text-[0.76rem] font-bold text-destructive" role="status">
          {getErrorMessage(mutationError, m.projects_mutation_failed())}
        </p>
      ) : null}
      <NamingDialog
        error={renameWorkflowMutation.error}
        m={m}
        onChangeName={(name) => setNamingState((state) => state ? { ...state, name } : state)}
        onClose={() => setNamingState(null)}
        onSubmit={handleNamingSubmit}
        pending={renameWorkflowMutation.isPending}
        state={namingState}
      />
      <DeleteResourceDialog
        error={deleteWorkflowMutation.error}
        m={m}
        onClose={() => setDeleteState(null)}
        onConfirm={handleDeleteConfirm}
        pending={deleteWorkflowMutation.isPending}
        state={deleteState}
      />
    </div>
  )
}
