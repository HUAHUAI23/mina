import type {
  AddWorkflowToProjectInput,
  CreateProjectFromWorkflowsInput,
  CreateProjectInput,
  DeleteProjectResponse,
  ProjectResponse,
  ProjectsOverviewResponse,
  RemoveWorkflowFromProjectResponse,
  UpdateProjectInput,
} from '@mina/contracts/modules/projects'
import {
  DeleteProjectResponseSchema,
  ProjectResponseSchema,
  ProjectsOverviewResponseSchema,
  RemoveWorkflowFromProjectResponseSchema,
} from '@mina/contracts/modules/projects'

import { apiClient } from '../../../lib/api-client'
import { readJson } from '../../../lib/http'

export const getProjectsOverview = async (): Promise<ProjectsOverviewResponse> => {
  const response = await apiClient.api.projects.overview.$get()
  return readJson(response, ProjectsOverviewResponseSchema)
}

export const getProject = async (projectId: string): Promise<ProjectResponse> => {
  const response = await apiClient.api.projects[':id'].$get({ param: { id: projectId } })
  return readJson(response, ProjectResponseSchema)
}

export const createProject = async (input: CreateProjectInput): Promise<ProjectResponse> => {
  const response = await apiClient.api.projects.$post({ json: input })
  return readJson(response, ProjectResponseSchema)
}

export const createProjectFromWorkflows = async (
  input: CreateProjectFromWorkflowsInput,
): Promise<ProjectResponse> => {
  const response = await apiClient.api.projects['from-workflows'].$post({ json: input })
  return readJson(response, ProjectResponseSchema)
}

export const addWorkflowToProject = async (
  projectId: string,
  input: AddWorkflowToProjectInput,
): Promise<ProjectResponse> => {
  const response = await apiClient.api.projects[':id'].workflows.$post({
    json: input,
    param: { id: projectId },
  })
  return readJson(response, ProjectResponseSchema)
}

export const updateProject = async (
  projectId: string,
  input: UpdateProjectInput,
): Promise<ProjectResponse> => {
  const response = await apiClient.api.projects[':id'].$patch({
    json: input,
    param: { id: projectId },
  })
  return readJson(response, ProjectResponseSchema)
}

export const deleteProject = async (projectId: string): Promise<DeleteProjectResponse> => {
  const response = await apiClient.api.projects[':id'].$delete({ param: { id: projectId } })
  return readJson(response, DeleteProjectResponseSchema)
}

export const removeWorkflowFromProject = async (
  projectId: string,
  workflowId: string,
): Promise<RemoveWorkflowFromProjectResponse> => {
  const response = await apiClient.api.projects[':id'].workflows[':workflowId'].$delete({
    param: { id: projectId, workflowId },
  })
  return readJson(response, RemoveWorkflowFromProjectResponseSchema)
}
