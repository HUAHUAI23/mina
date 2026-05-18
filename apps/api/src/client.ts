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
  CancelWorkflowRunResponse,
  CreateWorkflowInput,
  CreateWorkflowRunInput,
  DeleteWorkflowResponse,
  UpdateNodeMediaViewInput,
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
    $put: JsonEndpoint<{ json: UpdateWorkflowInput; param: { id: string } }, WorkflowResponse>
    $delete: JsonEndpoint<{ param: { id: string } }, DeleteWorkflowResponse>
  }
  '/api/workflows/:id/nodes/:nodeId/media-view': {
    $patch: JsonEndpoint<{ json: UpdateNodeMediaViewInput; param: { id: string; nodeId: string } }, WorkflowResponse>
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
