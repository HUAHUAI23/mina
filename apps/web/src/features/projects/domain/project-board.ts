import type { ProjectWithWorkflows } from '@mina/contracts/modules/projects'
import type { WorkflowSummary } from '@mina/contracts/modules/workflows'

export type ProjectBoardIdentifier = string | number

export type ProjectWorkflowDragData = {
  type: 'workflow'
  workflow: WorkflowSummary
}

export type ProjectWorkflowDropData =
  | {
      type: 'project'
      project: ProjectWithWorkflows
    }
  | {
      type: 'workflow'
      workflow: WorkflowSummary
    }

export type NamingDialogState =
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

export interface DeleteDialogState {
  id: string
  kind: 'project' | 'workflow'
  name: string
}

export const draggableId = (workflowId: string): string => `workflow:${workflowId}`

export const recentDraggableId = (workflowId: string): string => `workflow:recent:${workflowId}`

export const recentDropId = (workflowId: string): string => `workflow:recent-drop:${workflowId}`

export const projectDropId = (projectId: string): string => `project:${projectId}`

export const dragDataFromUnknown = (value: unknown): ProjectWorkflowDragData | undefined => {
  if (!value || typeof value !== 'object' || !('type' in value) || value.type !== 'workflow' || !('workflow' in value)) {
    return undefined
  }
  return value as ProjectWorkflowDragData
}

export const dropDataFromUnknown = (value: unknown): ProjectWorkflowDropData | undefined => {
  if (!value || typeof value !== 'object' || !('type' in value)) {
    return undefined
  }
  if (value.type === 'project' && 'project' in value) {
    return value as ProjectWorkflowDropData
  }
  if (value.type === 'workflow' && 'workflow' in value) {
    return value as ProjectWorkflowDropData
  }
  return undefined
}

export const workflowIdFromIdentifier = (workflowId: ProjectBoardIdentifier): string => {
  const parts = String(workflowId).split(':')
  if (parts[0] === 'workflow') {
    return parts[parts.length - 1] ?? String(workflowId)
  }
  return String(workflowId)
}

export const workflowById = (
  projects: ProjectWithWorkflows[],
  ungroupedWorkflows: WorkflowSummary[],
  workflowId: ProjectBoardIdentifier,
): WorkflowSummary | undefined => {
  const id = workflowIdFromIdentifier(workflowId)
  return [...ungroupedWorkflows, ...projects.flatMap((project) => project.workflows)].find((workflow) => workflow.id === id)
}

export const defaultProjectName = (source: WorkflowSummary, target: WorkflowSummary): string =>
  `${target.name} + ${source.name}`.slice(0, 120)

export const latestUpdatedAt = (workflows: WorkflowSummary[]): string | undefined =>
  workflows.reduce<string | undefined>((latest, workflow) => {
    if (!latest || Date.parse(workflow.updatedAt) > Date.parse(latest)) {
      return workflow.updatedAt
    }
    return latest
  }, undefined)
