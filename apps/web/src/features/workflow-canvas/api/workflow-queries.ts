import type {
  CreateWorkflowRunInput,
  UpdateNodeMediaViewInput,
  UpdateWorkflowInput,
  WorkflowNodeTaskHistoryResponse,
  WorkflowResponse,
  WorkflowRunListResponse,
  WorkflowRunResponse,
} from '@mina/contracts/modules/workflows'
import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import type { TaskResponse } from '@mina/contracts/modules/tasks'
import {
  WorkflowCanvasEdgeSchema,
  WorkflowCanvasNodeSchema,
} from '@mina/contracts/modules/canvas'
import {
  WorkflowNodeTaskHistoryResponseSchema,
  WorkflowResponseSchema,
  WorkflowRunListResponseSchema,
  WorkflowRunResponseSchema,
} from '@mina/contracts/modules/workflows'
import { TaskResponseSchema } from '@mina/contracts/modules/tasks'
import { z } from 'zod'

import { apiClient } from '../../../lib/api-client'
import { readJson } from '../../../lib/http'
import { readStoredAuthToken } from '../../auth/auth-session'
import { webEnv } from '../../../config/env'

export interface WorkflowCollaborationSnapshotResponse {
  item: {
    edges: WorkflowCanvasEdge[]
    nodes: WorkflowCanvasNode[]
    version: number
    workflowId: string
  }
}

const WorkflowCollaborationSnapshotResponseSchema = z.object({
  item: z.object({
    edges: z.array(WorkflowCanvasEdgeSchema),
    nodes: z.array(WorkflowCanvasNodeSchema),
    version: z.number().int().min(1),
    workflowId: z.string().min(1),
  }),
})

export const getWorkflow = async (workflowId: string): Promise<WorkflowResponse> => {
  const response = await apiClient.api.workflows[':id'].$get({ param: { id: workflowId } })
  return readJson(response, WorkflowResponseSchema)
}

export const saveWorkflow = async (workflowId: string, input: UpdateWorkflowInput): Promise<WorkflowResponse> => {
  const response = await apiClient.api.workflows[':id'].$put({ json: input, param: { id: workflowId } })
  return readJson(response, WorkflowResponseSchema)
}

export const patchNodeMediaView = async (
  workflowId: string,
  nodeId: string,
  input: UpdateNodeMediaViewInput,
): Promise<WorkflowResponse> => {
  const response = await apiClient.api.workflows[':id'].nodes[':nodeId']['media-view'].$patch({
    json: input,
    param: { id: workflowId, nodeId },
  })
  return readJson(response, WorkflowResponseSchema)
}

export const listWorkflowRuns = async (workflowId: string): Promise<WorkflowRunListResponse> => {
  const response = await apiClient.api.workflows[':id'].runs.$get({ param: { id: workflowId } })
  return readJson(response, WorkflowRunListResponseSchema)
}

export const createWorkflowRun = async (
  workflowId: string,
  input: CreateWorkflowRunInput,
): Promise<WorkflowRunResponse> => {
  const response = await apiClient.api.workflows[':id'].runs.$post({
    json: input,
    param: { id: workflowId },
  })
  return readJson(response, WorkflowRunResponseSchema)
}

export const getTask = async (taskId: string): Promise<TaskResponse> => {
  const response = await apiClient.api.tasks[':id'].$get({ param: { id: taskId } })
  return readJson(response, TaskResponseSchema)
}

export const getWorkflowCollaborationSnapshot = async (
  workflowId: string,
): Promise<WorkflowCollaborationSnapshotResponse> => {
  const base = webEnv.apiBaseUrl === '/' ? window.location.origin : webEnv.apiBaseUrl
  const url = new URL(`/api/workflows/${encodeURIComponent(workflowId)}/collab/snapshot`, base)
  const token = readStoredAuthToken()
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  return readJson(response, WorkflowCollaborationSnapshotResponseSchema)
}

export const listNodeTasks = async (
  workflowId: string,
  nodeId: string,
): Promise<WorkflowNodeTaskHistoryResponse> => {
  const response = await apiClient.api.workflows[':id'].nodes[':nodeId'].tasks.$get({
    param: { id: workflowId, nodeId },
  })
  return readJson(response, WorkflowNodeTaskHistoryResponseSchema)
}
