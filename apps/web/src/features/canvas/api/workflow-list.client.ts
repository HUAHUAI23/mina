import type {
  CreateWorkflowInput,
  DeleteWorkflowResponse,
  UpdateWorkflowInput,
  WorkflowListResponse,
  WorkflowResponse,
} from '@mina/contracts/modules/workflows'
import {
  DeleteWorkflowResponseSchema,
  WorkflowListResponseSchema,
  WorkflowResponseSchema,
} from '@mina/contracts/modules/workflows'

import { apiClient } from '../../../lib/api-client'
import { readJson } from '../../../lib/http'

export const listWorkflows = async (): Promise<WorkflowListResponse> => {
  const response = await apiClient.api.workflows.$get()
  return readJson(response, WorkflowListResponseSchema)
}

export const createWorkflow = async (input: CreateWorkflowInput): Promise<WorkflowResponse> => {
  const response = await apiClient.api.workflows.$post({ json: input })
  return readJson(response, WorkflowResponseSchema)
}

export const updateWorkflow = async (workflowId: string, input: UpdateWorkflowInput): Promise<WorkflowResponse> => {
  const response = await apiClient.api.workflows[':id'].$patch({
    json: input,
    param: { id: workflowId },
  })
  return readJson(response, WorkflowResponseSchema)
}

export const deleteWorkflow = async (workflowId: string): Promise<DeleteWorkflowResponse> => {
  const response = await apiClient.api.workflows[':id'].$delete({ param: { id: workflowId } })
  return readJson(response, DeleteWorkflowResponseSchema)
}
