import { useEffect, useState } from 'react'
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
import { formatRelativeTime } from '@mina/i18n'
import type { ProjectWithWorkflows } from '@mina/contracts/modules/projects'
import type { WorkflowSummary } from '@mina/contracts/modules/workflows'
import {
  ArrowLeft,
  FolderMinus,
  MoreVertical,
  Pencil,
  Plus,
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@mina/ui/components/dropdown-menu'
import { Input } from '@mina/ui/components/input'
import { Skeleton } from '@mina/ui/components/skeleton'
import { cn } from '@mina/ui/lib/utils'

import { useI18n, useMessages } from '../../../app/i18n-provider'
import { createWorkflow, deleteWorkflow, updateWorkflow } from '../../canvas/api/workflow-list.client'
import { workflowKeys } from '../../workflow-canvas/api/workflow-keys'
import type { WebMessages } from '../../../lib/i18n-messages'
import { getErrorMessage } from '../../../lib/http'
import {
  addWorkflowToProject,
  createProject,
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

const pageClassName = 'grid h-full min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden bg-surface-container-lowest'
const pageWithoutTabsClassName = 'grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-surface-container-lowest'
const pageHeaderClassName = 'flex min-h-20 items-center justify-between gap-4 border-b border-outline-ghost px-6 max-md:min-h-16 max-md:px-5'
const pageTitleClassName = 'font-display m-0 text-2xl leading-tight font-bold tracking-normal text-foreground max-md:text-xl'
const headerActionButtonClassName = 'inline-flex h-10 items-center gap-1.5 rounded-md border-0 bg-gray-100 px-3.5 text-foreground hover:bg-gray-100 hover:text-brand-accent'
const tabsClassName = 'flex min-h-16 items-end justify-between gap-6 border-b border-outline-ghost px-6 max-md:min-h-14 max-md:px-5'
const tabListClassName = 'flex min-w-0 items-end gap-8'
const activeTabClassName = 'relative flex h-16 items-center border-b-2 border-foreground px-0 text-base font-bold text-foreground max-md:h-14'
const passiveTabClassName = 'flex h-16 items-center border-0 bg-transparent px-0 text-base font-bold text-foreground-secondary hover:text-brand-accent max-md:h-14'
const contentClassName = 'min-h-0 min-w-0 overflow-y-auto px-6 py-6 [scrollbar-gutter:stable] max-md:px-5 max-md:py-6'
const dashboardSectionsClassName = 'grid min-h-0 min-w-0 gap-20'
const sectionClassName = 'grid gap-6 rounded-sm outline-none'
const sectionHeaderClassName = 'flex min-w-0 items-end justify-between gap-4 max-md:items-start'
const sectionTitleLineClassName = 'flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1'
const sectionTitleClassName = 'font-display m-0 truncate text-base font-bold leading-tight text-foreground'
const sectionMetaClassName = 'm-0 text-sm font-semibold leading-tight text-foreground-secondary'
const canvasGridClassName = 'grid min-w-0 justify-start gap-x-9 gap-y-9 [grid-template-columns:repeat(auto-fill,16.125rem)] max-sm:grid-cols-1'
const canvasCardClassName = 'group relative w-[16.125rem] min-w-0 rounded-md p-2 outline-none hover:bg-gray-100'
const projectCardClassName = 'group relative w-[16.125rem] min-w-0 rounded-md p-2 outline-none hover:bg-gray-100'
const overlayClassName = 'w-[16.125rem] rounded-md bg-surface-container-lowest shadow-floating'
const activeDropClassName = 'ring-2 ring-brand-accent ring-offset-2 ring-offset-surface-container-lowest'
const thumbnailClassName = 'relative h-[10.75rem] overflow-hidden rounded-md border border-outline-ghost bg-surface-container-low'
const projectThumbnailClassName = 'relative h-[10.75rem] overflow-hidden rounded-md border border-outline-ghost bg-surface-container-low'
const newCanvasCardClassName = 'group grid w-[16.125rem] min-w-0 rounded-md border border-dashed border-outline-ghost bg-transparent p-2 text-left outline-none hover:border-brand-accent/45 hover:bg-gray-100 hover:text-brand-accent focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-lowest focus-visible:outline-none disabled:cursor-not-allowed disabled:text-foreground-quaternary'
const iconButtonClassName = 'size-7 rounded-full text-foreground-tertiary hover:bg-gray-100 hover:text-brand-accent'
const backLinkClassName = 'flex size-10 flex-none items-center justify-center rounded-md bg-surface-container-low text-foreground-tertiary hover:bg-foreground hover:text-primary-foreground'
const dialogInputClassName = 'h-10 bg-surface-container-lowest'
const preventNativeLinkDrag = (event: DragEvent<HTMLAnchorElement>) => event.preventDefault()

type NamingDialogState =
  | {
      kind: 'create-canvas'
      name: string
    }
  | {
      kind: 'create-empty-project'
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
const recentDraggableId = (workflowId: string): string => `workflow:recent:${workflowId}`
const recentDropId = (workflowId: string): string => `workflow:recent-drop:${workflowId}`
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

const workflowIdFromIdentifier = (workflowId: UniqueIdentifier): string => {
  const parts = String(workflowId).split(':')
  if (parts[0] === 'workflow') {
    return parts[parts.length - 1] ?? String(workflowId)
  }
  return String(workflowId)
}

const workflowById = (
  projects: ProjectWithWorkflows[],
  ungroupedWorkflows: WorkflowSummary[],
  workflowId: UniqueIdentifier,
): WorkflowSummary | undefined => {
  const id = workflowIdFromIdentifier(workflowId)
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
      return m.projects_drag_end_project({ project: drop.project.name, title: workflow.name })
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
      return m.projects_drag_over_project({ project: drop.project.name, title: workflow.name })
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

const previewTones = ['paper', 'dashboard', 'icons', 'frames'] as const

const previewToneForId = (id: string): (typeof previewTones)[number] => {
  const total = Array.from(id).reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return previewTones[total % previewTones.length] ?? 'paper'
}

interface CanvasPreviewProps {
  id: string
  label: string
}

function CanvasPreview({ id, label }: CanvasPreviewProps) {
  const tone = previewToneForId(id)
  const isDashboard = tone === 'dashboard'
  const isIcons = tone === 'icons'
  const isFrames = tone === 'frames'

  return (
    <div className={thumbnailClassName} aria-label={label}>
      <div className="absolute inset-0 bg-linear-to-br from-surface-container-lowest via-surface-container-low to-surface-container-high" />
      <svg aria-hidden="true" className="absolute inset-0 size-full text-foreground-faint" fill="none" viewBox="0 0 242 172">
        <path d="M26 39h190M26 86h190M26 133h190M73 18v136M121 18v136M169 18v136" stroke="currentColor" strokeOpacity="0.18" />
        <path d="M37 116c32-53 53-49 75 1 19 42 46 43 87-12" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
        <circle cx="76" cy="66" r="18" stroke="currentColor" strokeOpacity="0.55" strokeWidth="3" />
      </svg>
      <div className="absolute left-5 top-5 h-20 w-16 rounded-md bg-surface-container-lowest/72 ring-1 ring-outline-ghost ring-inset" />
      <div className="absolute right-5 top-5 h-24 w-24 rounded-md bg-surface-container-lowest/78 ring-1 ring-outline-ghost ring-inset" />
      <div className="absolute right-9 top-9 size-9 rounded-full bg-brand-accent/18" />
      <div className="absolute right-16 top-16 h-8 w-11 rounded-sm bg-brand-accent/55" />
      <div className="absolute inset-x-5 bottom-5 grid gap-2 rounded-md bg-surface-container-lowest/72 p-3 ring-1 ring-outline-ghost ring-inset">
        <Skeleton className="h-2.5 w-28 rounded-full bg-surface-container-high" />
        <Skeleton className="h-2 w-36 rounded-full bg-surface-container" />
      </div>
      {isDashboard ? (
        <div className="absolute left-8 top-9 grid w-16 grid-cols-2 gap-1.5">
          <span className="h-6 rounded-sm bg-brand-accent/70" />
          <span className="h-6 rounded-sm bg-surface-container-highest" />
          <span className="col-span-2 h-4 rounded-sm bg-foreground/55" />
        </div>
      ) : null}
      {isIcons ? (
        <div className="absolute left-9 top-10 grid grid-cols-2 gap-1.5 text-brand-accent">
          <span className="size-5 rounded-full bg-current/75" />
          <span className="size-5 rounded-sm bg-current/55" />
          <span className="size-5 rounded-full border-2 border-current" />
          <span className="size-5 rounded-sm bg-foreground-faint" />
        </div>
      ) : null}
      {isFrames ? (
        <div className="absolute left-8 top-8 flex gap-1.5">
          <span className="h-12 w-6 rounded-sm bg-surface-container-lowest/85 ring-1 ring-outline-ghost ring-inset" />
          <span className="h-12 w-6 rounded-sm bg-brand-accent/62 ring-1 ring-outline-ghost ring-inset" />
          <span className="h-12 w-6 rounded-sm bg-surface-container-highest ring-1 ring-outline-ghost ring-inset" />
        </div>
      ) : null}
    </div>
  )
}

interface ProjectPreviewProps {
  m: WebMessages
  project: ProjectWithWorkflows
}

function ProjectPreview({ m, project }: ProjectPreviewProps) {
  const previewWorkflows = project.workflows.slice(0, 3)
  const layerCount = Math.max(previewWorkflows.length, 3)

  return (
    <div className={projectThumbnailClassName} aria-label={m.projects_canvas_preview_label()}>
      <div className="absolute inset-0 bg-linear-to-br from-surface-container-lowest via-surface-container-low to-surface-container-high" />
      <svg aria-hidden="true" className="absolute inset-0 size-full text-foreground-faint" fill="none" viewBox="0 0 242 172">
        <path d="M30 128 78 82l31 22 28-24 76 57" stroke="currentColor" strokeLinecap="round" strokeOpacity="0.46" strokeWidth="3" />
        <circle cx="190" cy="48" r="16" stroke="currentColor" strokeOpacity="0.46" strokeWidth="3" />
      </svg>
      <div className="absolute inset-x-5 top-5 flex items-center justify-between">
        <Skeleton className="h-2.5 w-20 rounded-full bg-surface-container-highest/80" />
        <span className="rounded-full bg-brand-accent/10 px-2.5 py-1 text-xs font-bold text-brand-accent ring-1 ring-brand-accent/10 ring-inset">
          {project.workflows.length}
        </span>
      </div>
      <div className="absolute inset-x-8 top-16 h-20">
        {Array.from({ length: layerCount }).map((_, index) => (
          <span
            className={cn(
              'absolute h-16 w-32 rounded-md bg-surface-container-lowest/78 ring-1 ring-outline-ghost ring-inset',
              index === 0 && 'left-0 top-2',
              index === 1 && 'left-8 top-0 bg-surface-container-lowest/88',
              index === 2 && 'left-16 top-4 bg-brand-accent/12',
            )}
            key={index}
          />
        ))}
      </div>
      <div className="absolute inset-x-5 bottom-5 grid gap-2">
        <Skeleton className="h-2.5 w-28 rounded-full bg-surface-container-high" />
        <Skeleton className="h-2 w-20 rounded-full bg-surface-container" />
      </div>
    </div>
  )
}

interface NewCanvasCardProps {
  disabled: boolean
  label: string
  onClick(): void
}

function NewCanvasCard({ disabled, label, onClick }: NewCanvasCardProps) {
  return (
    <button className={newCanvasCardClassName} disabled={disabled} onClick={onClick} type="button">
      <div className="relative h-[10.75rem] overflow-hidden rounded-md border border-dashed border-outline-ghost bg-surface-container-low/35 p-4 transition-colors group-hover:border-brand-accent/35 group-hover:bg-surface-container-lowest">
        <svg aria-hidden="true" className="absolute inset-0 size-full text-foreground-faint/45" fill="none" viewBox="0 0 242 172">
          <path d="M35 132 89 80l29 25 23-19 62 46" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
          <circle cx="179" cy="58" r="12" stroke="currentColor" strokeWidth="3" />
          <path d="M42 48h65M42 66h42" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
        </svg>
        <div className="absolute inset-4 rounded-md border border-dashed border-outline-ghost bg-surface-container-lowest/50 transition-colors group-hover:border-brand-accent/25" />
        <div className="absolute left-7 top-7 size-3 rounded-full border border-brand-accent/45" />
        <div className="absolute right-8 top-8 h-10 w-8 rounded-sm bg-brand-accent/12 ring-1 ring-brand-accent/10 ring-inset" />
        <div className="absolute right-14 top-16 h-10 w-8 rounded-sm bg-surface-container-high ring-1 ring-outline-ghost ring-inset" />
        <div className="absolute inset-x-7 bottom-7 grid gap-2">
          <Skeleton className="h-2 w-24 rounded-full bg-surface-container-high" />
          <Skeleton className="h-2 w-32 rounded-full bg-surface-container" />
        </div>
        <div className="absolute inset-0 grid place-items-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-surface-container-lowest text-brand-accent shadow-floating ring-1 ring-outline-ghost ring-inset transition-colors group-hover:bg-brand-accent group-hover:text-primary-foreground">
            <Plus aria-hidden="true" size={24} />
          </span>
        </div>
      </div>
      <span className="mt-3 block px-1 text-xs font-bold text-foreground-tertiary group-hover:text-brand-accent">{label}</span>
    </button>
  )
}

const latestUpdatedAt = (workflows: WorkflowSummary[]): string | undefined =>
  workflows.reduce<string | undefined>((latest, workflow) => {
    if (!latest || Date.parse(workflow.updatedAt) > Date.parse(latest)) {
      return workflow.updatedAt
    }
    return latest
  }, undefined)

interface ProjectCardProps {
  locale: ReturnType<typeof useI18n>['locale']
  m: WebMessages
  project: ProjectWithWorkflows
  isOver: boolean
  mutationPending: boolean
  onDelete(project: ProjectWithWorkflows): void
  onRename(project: ProjectWithWorkflows): void
}

function ProjectCard({ isOver, locale, m, mutationPending, onDelete, onRename, project }: ProjectCardProps) {
  const { setNodeRef: setDroppableNodeRef } = useDroppable({
    data: {
      type: 'project',
      project,
    } satisfies DropData,
    disabled: mutationPending,
    id: projectDropId(project.id),
  })

  return (
    <article className={cn(projectCardClassName, isOver && activeDropClassName)} ref={setDroppableNodeRef}>
      <Link
        aria-label={m.projects_open_project({ title: project.name })}
        className="block rounded-md focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-lowest focus-visible:outline-none"
        draggable={false}
        onDragStart={preventNativeLinkDrag}
        params={{ projectId: project.id }}
        to="/projects/$projectId"
      >
        <ProjectPreview m={m} project={project} />
      </Link>
      <div className="mt-3 flex min-w-0 items-start justify-between gap-2 px-1">
        <Link
          aria-label={m.projects_open_project({ title: project.name })}
          className="grid min-w-0 gap-1 text-left"
          draggable={false}
          onDragStart={preventNativeLinkDrag}
          params={{ projectId: project.id }}
          to="/projects/$projectId"
        >
          <h3 className="font-display m-0 truncate text-base leading-tight font-semibold text-foreground">{project.name}</h3>
          <p className="m-0 truncate text-sm font-semibold text-foreground-secondary">
            {m.projects_document_count_meta({
              count: project.workflows.length,
              time: formatRelativeTime(project.updatedAt, locale),
            })}
          </p>
        </Link>
        <div
          className="flex flex-none items-center gap-1"
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
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

interface ResourceGridProps {
  isLoading: boolean
  locale: ReturnType<typeof useI18n>['locale']
  m: WebMessages
  mutationPending: boolean
  overId: UniqueIdentifier | null
  projects: ProjectWithWorkflows[]
  workflows: WorkflowSummary[]
  onCreateCanvas(): void
  onDeleteProject(project: ProjectWithWorkflows): void
  onMoveToProject(project: ProjectWithWorkflows, workflow: WorkflowSummary): void
  onDelete(workflow: WorkflowSummary): void
  onRenameProject(project: ProjectWithWorkflows): void
  onRename(workflow: WorkflowSummary): void
}

function ResourceGrid({
  isLoading,
  locale,
  m,
  mutationPending,
  onCreateCanvas,
  onDelete,
  onDeleteProject,
  onMoveToProject,
  onRename,
  onRenameProject,
  overId,
  projects,
  workflows,
}: ResourceGridProps) {
  const itemCount = projects.length + workflows.length
  const latest = latestUpdatedAt([
    ...workflows,
    ...projects.map((project) => ({
      accountId: project.accountId,
      createdAt: project.createdAt,
      id: project.id,
      name: project.name,
      updatedAt: project.updatedAt,
      version: 0,
    })),
  ])

  return (
    <section className={sectionClassName}>
      <div className={sectionHeaderClassName}>
        <div className={sectionTitleLineClassName}>
          <h2 className={sectionTitleClassName}>{m.projects_recent_resources()}</h2>
          {itemCount > 0 && latest ? (
            <p className={sectionMetaClassName}>
              {m.projects_document_count_meta({ count: itemCount, time: formatRelativeTime(latest, locale) })}
            </p>
          ) : null}
        </div>
      </div>

      <div className={canvasGridClassName}>
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            isOver={overId === projectDropId(project.id)}
            locale={locale}
            m={m}
            mutationPending={mutationPending}
            onDelete={onDeleteProject}
            onRename={onRenameProject}
            project={project}
          />
        ))}
        {workflows.map((workflow) => (
          <DraggableWorkflowCard
            disabled={mutationPending}
            isOver={overId === draggableId(workflow.id)}
            key={workflow.id}
            locale={locale}
            m={m}
            moveProjects={projects}
            onDelete={onDelete}
            onMoveToProject={(project) => onMoveToProject(project, workflow)}
            onRename={onRename}
            workflow={workflow}
          />
        ))}
        {!isLoading ? <NewCanvasCard disabled={mutationPending} label={m.projects_new_canvas()} onClick={onCreateCanvas} /> : null}
      </div>
    </section>
  )
}

interface RecentCanvasSectionProps {
  locale: ReturnType<typeof useI18n>['locale']
  m: WebMessages
  mutationPending: boolean
  ungroupedWorkflowIds: ReadonlySet<string>
  workflows: WorkflowSummary[]
}

function RecentCanvasSection({ locale, m, mutationPending, ungroupedWorkflowIds, workflows }: RecentCanvasSectionProps) {
  return (
    <section className={sectionClassName}>
      <div className={canvasGridClassName}>
        {workflows.map((workflow) =>
          ungroupedWorkflowIds.has(workflow.id) ? (
            <DraggableWorkflowCard
              disabled={mutationPending}
              dragId={recentDraggableId(workflow.id)}
              dropDisabled
              dropId={recentDropId(workflow.id)}
              key={workflow.id}
              locale={locale}
              m={m}
              workflow={workflow}
            />
          ) : (
            <WorkflowCard
              dropDisabled
              dropId={recentDropId(workflow.id)}
              key={workflow.id}
              locale={locale}
              m={m}
              workflow={workflow}
            />
          ),
        )}
        {workflows.length === 0 ? (
          <div className="grid min-h-40 content-center rounded-md border border-dashed border-outline-ghost bg-surface-container-low px-6 py-8 text-foreground-tertiary">
            <h2 className="m-0 text-base font-bold text-foreground">{m.projects_empty_title()}</h2>
            <p className="m-0 mt-1 text-sm leading-relaxed">{m.projects_empty_body()}</p>
          </div>
        ) : null}
      </div>
    </section>
  )
}

interface WorkflowCardProps {
  actionSlot?: ReactNode
  dropDisabled?: boolean
  dropId?: string
  isOver?: boolean
  locale: ReturnType<typeof useI18n>['locale']
  m: WebMessages
  moveProjects?: ProjectWithWorkflows[] | undefined
  overlay?: boolean
  workflow: WorkflowSummary
  onDelete?(workflow: WorkflowSummary): void
  onMoveToProject?: ((project: ProjectWithWorkflows, workflow: WorkflowSummary) => void) | undefined
  onRemoveFromProject?: ((workflow: WorkflowSummary) => void) | undefined
  onRename?(workflow: WorkflowSummary): void
}

function WorkflowCard({
  actionSlot,
  dropDisabled = false,
  dropId,
  isOver = false,
  locale,
  m,
  moveProjects,
  overlay = false,
  workflow,
  onDelete,
  onMoveToProject,
  onRemoveFromProject,
  onRename,
}: WorkflowCardProps) {
  const { setNodeRef: setDroppableNodeRef } = useDroppable({
    data: {
      type: 'workflow',
      workflow,
    } satisfies DropData,
    disabled: overlay || dropDisabled,
    id: dropId ?? draggableId(workflow.id),
  })

  return (
    <article
      className={cn(canvasCardClassName, isOver && activeDropClassName, overlay && overlayClassName)}
      ref={overlay || dropDisabled ? undefined : setDroppableNodeRef}
    >
      <Link
        aria-label={m.projects_open_canvas({ title: workflow.name })}
        className="block rounded-md focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-lowest focus-visible:outline-none"
        draggable={false}
        onDragStart={preventNativeLinkDrag}
        params={{ workflowId: workflow.id }}
        to="/canvas/$workflowId"
      >
        <CanvasPreview id={workflow.id} label={m.projects_canvas_preview_label()} />
      </Link>
      <div className="mt-3 flex min-w-0 items-start justify-between gap-2 px-1">
        <Link
          aria-label={m.projects_open_canvas({ title: workflow.name })}
          className="grid min-w-0 gap-1 text-left"
          draggable={false}
          onDragStart={preventNativeLinkDrag}
          params={{ workflowId: workflow.id }}
          to="/canvas/$workflowId"
        >
          <h3 className="font-display m-0 truncate text-base leading-tight font-semibold text-foreground">{workflow.name}</h3>
          <p className="m-0 truncate text-sm font-semibold text-foreground-secondary">
            {formatRelativeTime(workflow.updatedAt, locale)}
          </p>
        </Link>
        {overlay ? null : actionSlot ?? (
          <ResourceActions
            deleteLabel={m.projects_delete_canvas()}
            editLabel={m.projects_rename_canvas()}
            menuLabel={m.projects_more_actions({ title: workflow.name })}
            moveLabel={m.projects_move_to_project()}
            moveProjects={moveProjects}
            onDelete={onDelete ? () => onDelete(workflow) : undefined}
            onMoveToProject={onMoveToProject ? (project) => onMoveToProject(project, workflow) : undefined}
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
  dragId?: string
}

function DraggableWorkflowCard({ disabled = false, dragId, ...props }: DraggableWorkflowCardProps) {
  const { attributes, isDragging, listeners, setNodeRef, transform } = useDraggable({
    data: {
      type: 'workflow',
      workflow: props.workflow,
    } satisfies DragData,
    disabled,
    id: dragId ?? draggableId(props.workflow.id),
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
              moveLabel={props.m.projects_move_to_project()}
              moveProjects={props.moveProjects}
              onDelete={props.onDelete ? () => props.onDelete?.(props.workflow) : undefined}
              onMoveToProject={props.onMoveToProject ? (project) => props.onMoveToProject?.(project, props.workflow) : undefined}
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
  moveLabel?: string
  moveProjects?: ProjectWithWorkflows[] | undefined
  removeFromProjectLabel?: string
  onDelete?: (() => void) | undefined
  onMoveToProject?: ((project: ProjectWithWorkflows) => void) | undefined
  onRemoveFromProject?: (() => void) | undefined
  onRename?: (() => void) | undefined
}

function ResourceActions({
  deleteLabel,
  editLabel,
  menuLabel,
  moveLabel,
  moveProjects = [],
  onDelete,
  onMoveToProject,
  onRemoveFromProject,
  onRename,
  removeFromProjectLabel,
}: ResourceActionsProps) {
  const canMoveToProject = Boolean(moveLabel && onMoveToProject && moveProjects.length > 0)

  if (!onDelete && !onRemoveFromProject && !onRename && !canMoveToProject) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label={menuLabel} className={iconButtonClassName} size="icon-sm" type="button" variant="ghost">
          <MoreVertical aria-hidden="true" size={18} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {onRename ? (
          <DropdownMenuItem onClick={onRename}>
            <Pencil aria-hidden="true" size={15} />
            <span className="min-w-0 truncate">{editLabel}</span>
          </DropdownMenuItem>
        ) : null}
        {canMoveToProject ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderMinus aria-hidden="true" size={15} />
              <span className="min-w-0 truncate">{moveLabel}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-52">
              {moveProjects.map((project) => (
                <DropdownMenuItem key={project.id} onClick={() => onMoveToProject?.(project)}>
                  <span className="min-w-0 truncate">{project.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}
        {onRemoveFromProject && removeFromProjectLabel ? (
          <DropdownMenuItem onClick={onRemoveFromProject}>
            <FolderMinus aria-hidden="true" size={15} />
            <span className="min-w-0 truncate">{removeFromProjectLabel}</span>
          </DropdownMenuItem>
        ) : null}
        {onDelete ? (
          <DropdownMenuItem onClick={onDelete} variant="destructive">
            <Trash2 aria-hidden="true" size={15} />
            <span className="min-w-0 truncate">{deleteLabel}</span>
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
  if (state.kind === 'create-empty-project' || state.kind === 'create-project') {
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
              <p className="m-0 text-xs font-bold text-destructive" role="status">
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
          <p className="m-0 text-xs font-bold text-destructive" role="status">
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
  const ungroupedWorkflowIds = new Set(ungroupedWorkflows.map((workflow) => workflow.id))
  const recentWorkflows = [...ungroupedWorkflows, ...projects.flatMap((project) => project.workflows)]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, 6)
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
  const createEmptyProjectMutation = useMutation({
    mutationFn: (name: string) => createProject({ name, workflowIds: [] }),
    onSuccess: (response) => {
      setNamingState(null)
      void queryClient.invalidateQueries({ queryKey: projectKeys.overview() })
      void queryClient.invalidateQueries({ queryKey: workflowKeys.list() })
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
      void queryClient.invalidateQueries({ queryKey: projectKeys.overview() })
      void queryClient.invalidateQueries({ queryKey: workflowKeys.list() })
    },
  })
  const addWorkflowMutation = useMutation({
    mutationFn: (input: { projectId: string; workflow: WorkflowSummary }) =>
      addWorkflowToProject(input.projectId, { workflowId: input.workflow.id }),
    onSuccess: (_response, input) => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.detail(input.projectId) })
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
    if (source.id === drop.workflow.id) {
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
      <header className={pageHeaderClassName}>
        <h1 className={pageTitleClassName}>{m.app_nav_projects()}</h1>
        <button
          className={headerActionButtonClassName}
          disabled={createEmptyProjectMutation.isPending}
          onClick={() => setNamingState({ kind: 'create-empty-project', name: '' })}
          type="button"
        >
          <Plus aria-hidden="true" size={14} />
          <span className="text-sm font-medium">{m.projects_new_project()}</span>
        </button>
      </header>

      <div className={tabsClassName}>
        <div className={tabListClassName}>
          <button className={activeTabClassName} type="button">
            {m.projects_recent_tab()}
          </button>
        </div>
        <button className={passiveTabClassName} type="button">
          {m.projects_deleted_tab()}
        </button>
      </div>

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
        <div className={contentClassName}>
          <div className={dashboardSectionsClassName}>
            <RecentCanvasSection
              locale={locale}
              m={m}
              mutationPending={mutationPending}
              ungroupedWorkflowIds={ungroupedWorkflowIds}
              workflows={recentWorkflows}
            />
            <ResourceGrid
              isLoading={projectsQuery.isLoading}
              locale={locale}
              m={m}
              mutationPending={mutationPending}
              overId={overId}
              projects={projects}
              onCreateCanvas={() => setNamingState({ kind: 'create-canvas', name: '' })}
              onDelete={(workflow) => setDeleteState({ id: workflow.id, kind: 'workflow', name: workflow.name })}
              onDeleteProject={(project) => setDeleteState({ id: project.id, kind: 'project', name: project.name })}
              onMoveToProject={(project, workflow) => handleAddToProject(project.id, workflow)}
              onRename={(workflow) => setNamingState({ kind: 'rename-workflow', name: workflow.name, workflow })}
              onRenameProject={(project) => setNamingState({ kind: 'rename-project', name: project.name, project })}
              workflows={ungroupedWorkflows}
            />
          </div>

          {mutationError ? (
            <p className="m-0 mt-6 text-xs font-bold text-destructive" role="status">
              {getErrorMessage(mutationError, m.projects_mutation_failed())}
            </p>
          ) : null}
        </div>

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
        error={createCanvasMutation.error ?? createEmptyProjectMutation.error ?? createProjectMutation.error ?? renameProjectMutation.error ?? renameWorkflowMutation.error}
        m={m}
        onChangeName={(name) => setNamingState((state) => state ? { ...state, name } : state)}
        onClose={() => setNamingState(null)}
        onSubmit={handleNamingSubmit}
        pending={createCanvasMutation.isPending || createEmptyProjectMutation.isPending || createProjectMutation.isPending || renameProjectMutation.isPending || renameWorkflowMutation.isPending}
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
  const createProjectCanvasMutation = useMutation({
    mutationFn: async (name: string) => {
      const workflow = await createWorkflow({ name, nodes: [], edges: [] })
      await addWorkflowToProject(projectId, { workflowId: workflow.item.id })
      return workflow
    },
    onSuccess: () => {
      setNamingState(null)
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

  const handleNamingSubmit = () => {
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

  const handleDeleteConfirm = () => {
    if (!deleteState || deleteState.kind !== 'workflow' || mutationPending) {
      return
    }
    deleteWorkflowMutation.mutate(deleteState.id)
  }

  if (projectQuery.isLoading) {
    return (
      <div className={pageWithoutTabsClassName}>
        <header className={pageHeaderClassName}>
          <p className="m-0 text-sm font-bold text-foreground-quaternary" role="status">
            {m.projects_loading_project()}
          </p>
        </header>
      </div>
    )
  }

  if (projectQuery.isError || !project) {
    return (
      <div className={pageWithoutTabsClassName}>
        <header className={pageHeaderClassName}>
          <div className="flex min-w-0 items-center gap-3">
            <Link aria-label={m.projects_back_to_projects()} className={backLinkClassName} to="/projects">
              <ArrowLeft aria-hidden="true" size={17} />
            </Link>
            <p className="m-0 text-sm font-bold text-destructive" role="status">
              {getErrorMessage(projectQuery.error, m.projects_project_unavailable())}
            </p>
          </div>
        </header>
      </div>
    )
  }

  return (
    <div className={pageWithoutTabsClassName}>
      <header className={pageHeaderClassName}>
        <div className="flex min-w-0 items-center gap-3">
          <Link aria-label={m.projects_back_to_projects()} className={backLinkClassName} to="/projects">
            <ArrowLeft aria-hidden="true" size={17} />
          </Link>
          <h1 className={pageTitleClassName}>{project.name}</h1>
        </div>
      </header>

      <div className={contentClassName}>
        <section className={sectionClassName}>
          <div className={sectionHeaderClassName}>
            <div className={sectionTitleLineClassName}>
              <h2 className={sectionTitleClassName}>{project.name}</h2>
              <p className={sectionMetaClassName}>
                {m.projects_document_count_meta({
                  count: project.workflows.length,
                  time: formatRelativeTime(project.updatedAt, locale),
                })}
              </p>
            </div>
          </div>

          <div className={canvasGridClassName}>
            {project.workflows.map((workflow) => (
              <WorkflowCard
                dropDisabled
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
            <NewCanvasCard
              disabled={mutationPending}
              label={m.projects_new_canvas()}
              onClick={() => setNamingState({ kind: 'create-canvas', name: '' })}
            />
          </div>
        </section>

        {mutationError ? (
          <p className="m-0 mt-6 text-xs font-bold text-destructive" role="status">
            {getErrorMessage(mutationError, m.projects_mutation_failed())}
          </p>
        ) : null}
      </div>

      <NamingDialog
        error={createProjectCanvasMutation.error ?? renameWorkflowMutation.error}
        m={m}
        onChangeName={(name) => setNamingState((state) => state ? { ...state, name } : state)}
        onClose={() => setNamingState(null)}
        onSubmit={handleNamingSubmit}
        pending={createProjectCanvasMutation.isPending || renameWorkflowMutation.isPending}
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
