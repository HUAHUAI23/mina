import type {
  CreateWorkflowRunInput,
  WorkflowNodeTaskHistoryResponse,
  WorkflowResponse,
  WorkflowRunListResponse,
  WorkflowRunResponse,
} from '@mina/contracts/modules/workflows'
import type { TaskResponse } from '@mina/contracts/modules/tasks'
import {
  WorkflowNodeTaskHistoryResponseSchema,
  WorkflowResponseSchema,
  WorkflowRunListResponseSchema,
  WorkflowRunResponseSchema,
} from '@mina/contracts/modules/workflows'
import { TaskResponseSchema } from '@mina/contracts/modules/tasks'

import { apiClient } from '../../../lib/api-client'
import { readJson } from '../../../lib/http'

export const getWorkflow = async (workflowId: string): Promise<WorkflowResponse> => {
  const response = await apiClient.api.workflows[':id'].$get({ param: { id: workflowId } })
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

export const listNodeTasks = async (
  workflowId: string,
  nodeId: string,
): Promise<WorkflowNodeTaskHistoryResponse> => {
  const response = await apiClient.api.workflows[':id'].nodes[':nodeId'].tasks.$get({
    param: { id: workflowId, nodeId },
  })
  return readJson(response, WorkflowNodeTaskHistoryResponseSchema)
}
