import { z } from 'zod'

import { WorkflowSummarySchema } from '../workflows/workflow.schemas'

export const ProjectSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const ProjectWorkflowSchema = z.object({
  projectId: z.string().min(1),
  workflowId: z.string().min(1),
  sortOrder: z.number().int().min(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const ProjectWithWorkflowsSchema = ProjectSchema.extend({
  workflows: z.array(WorkflowSummarySchema),
})

export const CreateProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  workflowIds: z.array(z.string().min(1)).max(100).default([]),
})

export const CreateProjectFromWorkflowsSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  sourceWorkflowId: z.string().min(1),
  targetWorkflowId: z.string().min(1),
})

export const AddWorkflowToProjectSchema = z.object({
  workflowId: z.string().min(1),
})

export const UpdateProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
})

export const ProjectParamsSchema = z.object({
  id: z.string().min(1),
})

export const ProjectWorkflowParamsSchema = z.object({
  id: z.string().min(1),
  workflowId: z.string().min(1),
})

export const ProjectsOverviewResponseSchema = z.object({
  projects: z.array(ProjectWithWorkflowsSchema),
  ungroupedWorkflows: z.array(WorkflowSummarySchema),
})

export const ProjectListResponseSchema = z.object({
  items: z.array(ProjectWithWorkflowsSchema),
})

export const ProjectResponseSchema = z.object({
  item: ProjectWithWorkflowsSchema,
})

export const DeleteProjectResponseSchema = z.object({
  success: z.literal(true),
})

export const RemoveWorkflowFromProjectResponseSchema = z.object({
  success: z.literal(true),
})

export type AddWorkflowToProjectInput = z.infer<typeof AddWorkflowToProjectSchema>
export type CreateProjectFromWorkflowsInput = z.infer<typeof CreateProjectFromWorkflowsSchema>
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>
export type DeleteProjectResponse = z.infer<typeof DeleteProjectResponseSchema>
export type Project = z.infer<typeof ProjectSchema>
export type ProjectListResponse = z.infer<typeof ProjectListResponseSchema>
export type ProjectParams = z.infer<typeof ProjectParamsSchema>
export type ProjectResponse = z.infer<typeof ProjectResponseSchema>
export type ProjectsOverviewResponse = z.infer<typeof ProjectsOverviewResponseSchema>
export type ProjectWorkflow = z.infer<typeof ProjectWorkflowSchema>
export type ProjectWorkflowParams = z.infer<typeof ProjectWorkflowParamsSchema>
export type ProjectWithWorkflows = z.infer<typeof ProjectWithWorkflowsSchema>
export type RemoveWorkflowFromProjectResponse = z.infer<typeof RemoveWorkflowFromProjectResponseSchema>
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>
