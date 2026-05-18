import type { CreateWorkflowInput, WorkflowListResponse, WorkflowResponse } from '@mina/contracts/modules/workflows'
import { WorkflowListResponseSchema, WorkflowResponseSchema } from '@mina/contracts/modules/workflows'

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
