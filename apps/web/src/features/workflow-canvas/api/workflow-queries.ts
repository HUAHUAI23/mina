import type {
  CheckpointWorkflowCollaborationInput,
  CreateWorkflowRunInput,
  WorkflowCollaborationCheckpointResponse,
  WorkflowNodeTaskHistoryResponse,
  WorkflowResponse,
  WorkflowRunListResponse,
  WorkflowRunResponse,
} from '@mina/contracts/modules/workflows'
import type { TaskResponse } from '@mina/contracts/modules/tasks'
import {
  WorkflowNodeTaskHistoryResponseSchema,
  WorkflowCollaborationCheckpointResponseSchema,
  WorkflowResponseSchema,
  WorkflowRunListResponseSchema,
  WorkflowRunResponseSchema,
} from '@mina/contracts/modules/workflows'
import { TaskResponseSchema } from '@mina/contracts/modules/tasks'

import { apiClient } from '../../../lib/api-client'
import { readJson } from '../../../lib/http'
import { readStoredAuthToken } from '../../auth/auth-session'
import { webEnv } from '../../../config/env'

export const getWorkflow = async (workflowId: string): Promise<WorkflowResponse> => {
  const response = await apiClient.api.workflows[':id'].$get({ param: { id: workflowId } })
  return readJson(response, WorkflowResponseSchema)
}

export const checkpointWorkflowCollaboration = async (
  workflowId: string,
  input: CheckpointWorkflowCollaborationInput,
): Promise<WorkflowCollaborationCheckpointResponse> => {
  const base = webEnv.apiBaseUrl === '/' ? window.location.origin : webEnv.apiBaseUrl
  const url = new URL(`/api/workflows/${encodeURIComponent(workflowId)}/collab/checkpoint`, base)
  const token = readStoredAuthToken()
  const response = await fetch(url, {
    body: JSON.stringify(input),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    method: 'POST',
  })
  return readJson(response, WorkflowCollaborationCheckpointResponseSchema)
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

export const listNodeTasks = async (
  workflowId: string,
  nodeId: string,
): Promise<WorkflowNodeTaskHistoryResponse> => {
  const response = await apiClient.api.workflows[':id'].nodes[':nodeId'].tasks.$get({
    param: { id: workflowId, nodeId },
  })
  return readJson(response, WorkflowNodeTaskHistoryResponseSchema)
}
