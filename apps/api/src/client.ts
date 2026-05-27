import type {
  AuthResponse,
  LoginInput,
  RegisterInput,
} from '@mina/contracts/modules/accounts'
import type {
  CancelTaskResponse,
  CreateTaskInput,
  TaskListResponse,
  TaskResourceListResponse,
  TaskResponse,
} from '@mina/contracts/modules/tasks'
import type { TaskModelCatalogResponse } from '@mina/contracts/modules/tasks/model-catalog'
import type {
  CompletePresignedMediaUploadInput,
  CreateMediaObjectInput,
  CreatePresignedMediaUploadInput,
  CreatePresignedMediaUploadResponse,
  GetMediaObjectResponse,
  MediaObjectResponse,
} from '@mina/contracts/modules/media/media-object'
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
import type {
  CancelWorkflowRunResponse,
  CreateWorkflowInput,
  CreateWorkflowRunInput,
  DeleteWorkflowResponse,
  UpdateWorkflowInput,
  WorkflowListResponse,
  WorkflowNodeTaskHistoryResponse,
  WorkflowResponse,
  WorkflowRunListResponse,
  WorkflowRunResponse,
} from '@mina/contracts/modules/workflows'
import type { Hono } from 'hono'
import type { BlankEnv } from 'hono/types'

type JsonEndpoint<Input, Output, Status extends number = 200> = {
  input: Input
  output: Output
  outputFormat: 'json'
  status: Status
}

type CreateMediaObjectForm = CreateMediaObjectInput & {
  file: File
}

type ClientSchema = {
  '/api/auth/login': {
    $post: JsonEndpoint<{ json: LoginInput }, AuthResponse>
  }
  '/api/auth/register': {
    $post: JsonEndpoint<{ json: RegisterInput }, AuthResponse, 201>
  }
  '/api/health': {
    $get: JsonEndpoint<
      {},
      {
        service: string
        status: 'ok'
        timestamp: string
      }
    >
  }
  '/api/tasks': {
    $get: JsonEndpoint<{}, TaskListResponse>
    $post: JsonEndpoint<{ json: CreateTaskInput }, TaskResponse, 201>
  }
  '/api/projects/overview': {
    $get: JsonEndpoint<{}, ProjectsOverviewResponse>
  }
  '/api/projects': {
    $post: JsonEndpoint<{ json: CreateProjectInput }, ProjectResponse, 201>
  }
  '/api/projects/from-workflows': {
    $post: JsonEndpoint<{ json: CreateProjectFromWorkflowsInput }, ProjectResponse, 201>
  }
  '/api/projects/:id': {
    $get: JsonEndpoint<{ param: { id: string } }, ProjectResponse>
    $patch: JsonEndpoint<{ json: UpdateProjectInput; param: { id: string } }, ProjectResponse>
    $delete: JsonEndpoint<{ param: { id: string } }, DeleteProjectResponse>
  }
  '/api/projects/:id/workflows': {
    $post: JsonEndpoint<{ json: AddWorkflowToProjectInput; param: { id: string } }, ProjectResponse>
  }
  '/api/projects/:id/workflows/:workflowId': {
    $delete: JsonEndpoint<{ param: { id: string; workflowId: string } }, RemoveWorkflowFromProjectResponse>
  }
  '/api/tasks/models': {
    $get: JsonEndpoint<{}, TaskModelCatalogResponse>
  }
  '/api/tasks/:id': {
    $get: JsonEndpoint<{ param: { id: string } }, TaskResponse>
  }
  '/api/tasks/:id/resources': {
    $get: JsonEndpoint<{ param: { id: string } }, TaskResourceListResponse>
  }
  '/api/tasks/:id/cancel': {
    $post: JsonEndpoint<{ param: { id: string } }, CancelTaskResponse>
  }
  '/api/workflows': {
    $get: JsonEndpoint<{}, WorkflowListResponse>
    $post: JsonEndpoint<{ json: CreateWorkflowInput }, WorkflowResponse, 201>
  }
  '/api/workflows/:id': {
    $get: JsonEndpoint<{ param: { id: string } }, WorkflowResponse>
    $patch: JsonEndpoint<{ json: UpdateWorkflowInput; param: { id: string } }, WorkflowResponse>
    $delete: JsonEndpoint<{ param: { id: string } }, DeleteWorkflowResponse>
  }
  '/api/workflows/:id/nodes/:nodeId/tasks': {
    $get: JsonEndpoint<{ param: { id: string; nodeId: string } }, WorkflowNodeTaskHistoryResponse>
  }
  '/api/workflows/:id/runs': {
    $get: JsonEndpoint<{ param: { id: string } }, WorkflowRunListResponse>
    $post: JsonEndpoint<{ json: CreateWorkflowRunInput; param: { id: string } }, WorkflowRunResponse, 201>
  }
  '/api/workflow-runs/:runId': {
    $get: JsonEndpoint<{ param: { runId: string } }, WorkflowRunResponse>
  }
  '/api/workflow-runs/:runId/cancel': {
    $post: JsonEndpoint<{ param: { runId: string } }, CancelWorkflowRunResponse>
  }
  '/api/media-objects': {
    $post: JsonEndpoint<{ form: CreateMediaObjectForm }, MediaObjectResponse, 201>
  }
  '/api/media-objects/:id': {
    $get: JsonEndpoint<{ param: { id: string } }, GetMediaObjectResponse>
  }
  '/api/media-objects/presigned-upload': {
    $post: JsonEndpoint<{ json: CreatePresignedMediaUploadInput }, CreatePresignedMediaUploadResponse, 201>
  }
  '/api/media-objects/:id/complete-upload': {
    $post: JsonEndpoint<{ json: CompletePresignedMediaUploadInput; param: { id: string } }, MediaObjectResponse>
  }
}

export type AppType = Hono<BlankEnv, ClientSchema, '/'>
