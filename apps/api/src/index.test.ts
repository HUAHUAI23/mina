import { describe, expect, test } from 'bun:test'
import type { ApiError, DeletePostResponse, PostListResponse, PostResponse } from '@mina/contracts/modules/posts'
import type {
  CancelTaskResponse,
  TaskListResponse,
  TaskResourceListResponse,
  TaskResponse,
} from '@mina/contracts/modules/tasks'
import type {
  CancelWorkflowRunResponse,
  DeleteWorkflowResponse,
  WorkflowListResponse,
  WorkflowResponse,
  WorkflowRunListResponse,
  WorkflowRunResponse,
} from '@mina/contracts/modules/workflows'

import { createApp } from './app/create-app'

describe('mina api', () => {
  const app = createApp()

  test('GET /api/health returns an operational payload', async () => {
    const response = await app.request('/api/health')
    const payload = (await response.json()) as {
      service: string
      status: 'ok'
      timestamp: string
    }

    expect(response.status).toBe(200)
    expect(payload.status).toBe('ok')
    expect(payload.service).toBe('@mina/api')
  })

  test('POST /api/posts creates a typed record', async () => {
    const response = await app.request('/api/posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Testing the refactored API',
        body: 'This payload is long enough to satisfy the shared zod contract.',
      }),
    })

    const payload = (await response.json()) as PostResponse

    expect(response.status).toBe(201)
    expect(payload.item.id).toBeGreaterThan(0)
    expect(payload.item.title).toBe('Testing the refactored API')
  })

  test('GET /api/posts lists typed records', async () => {
    const response = await app.request('/api/posts')
    const payload = (await response.json()) as PostListResponse

    expect(response.status).toBe(200)
    expect(payload.items.length).toBeGreaterThan(0)
  })

  test('GET /api/posts/:id returns a typed record', async () => {
    const response = await app.request('/api/posts/1')
    const payload = (await response.json()) as PostResponse

    expect(response.status).toBe(200)
    expect(payload.item.id).toBe(1)
  })

  test('DELETE /api/posts/:id deletes an existing record', async () => {
    const app = createApp()
    const createResponse = await app.request('/api/posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Delete route coverage',
        body: 'This payload is long enough to create a post for deletion.',
      }),
    })
    const created = (await createResponse.json()) as PostResponse

    const response = await app.request(`/api/posts/${created.item.id}`, {
      method: 'DELETE',
    })
    const payload = (await response.json()) as DeletePostResponse

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
  })

  test('DELETE /api/posts/:id returns 404 for unknown records', async () => {
    const response = await app.request('/api/posts/9999', {
      method: 'DELETE',
    })

    const payload = (await response.json()) as ApiError

    expect(response.status).toBe(404)
    expect(payload.error.code).toBe('POST_NOT_FOUND')
  })

  test('POST /api/tasks creates an independently runnable task', async () => {
    const app = createApp()
    const response = await app.request('/api/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        config: {
          kind: 'image_generation',
          mode: 'text_to_image',
          provider: 'dev',
          model: 'dev-image',
          prompt: 'route task',
          size: '1024x1024',
          count: 1,
        },
      }),
    })
    const payload = (await response.json()) as TaskResponse

    expect(response.status).toBe(201)
    expect(payload.item.status).toBe('queued')
  })

  test('task routes expose list, detail, resources, and cancellation payloads', async () => {
    const app = createApp()
    const createResponse = await app.request('/api/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        config: {
          kind: 'image_generation',
          mode: 'text_to_image',
          provider: 'dev',
          model: 'dev-image',
          prompt: 'route task coverage',
          size: '1024x1024',
          count: 1,
        },
      }),
    })
    const created = (await createResponse.json()) as TaskResponse

    const listResponse = await app.request('/api/tasks')
    const listPayload = (await listResponse.json()) as TaskListResponse
    expect(listResponse.status).toBe(200)
    expect(listPayload.items.some((task) => task.id === created.item.id)).toBe(true)

    const detailResponse = await app.request(`/api/tasks/${created.item.id}`)
    const detailPayload = (await detailResponse.json()) as TaskResponse
    expect(detailResponse.status).toBe(200)
    expect(detailPayload.item.id).toBe(created.item.id)

    const resourcesResponse = await app.request(`/api/tasks/${created.item.id}/resources`)
    const resourcesPayload = (await resourcesResponse.json()) as TaskResourceListResponse
    expect(resourcesResponse.status).toBe(200)
    expect(resourcesPayload.items).toEqual([])

    const cancelResponse = await app.request(`/api/tasks/${created.item.id}/cancel`, {
      method: 'POST',
    })
    const cancelPayload = (await cancelResponse.json()) as CancelTaskResponse
    expect(cancelResponse.status).toBe(200)
    expect(cancelPayload.success).toBe(true)
  })

  test('POST /api/workflows/:id/runs executes an isolated image node', async () => {
    const createResponse = await app.request('/api/workflows', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Route workflow',
        nodes: [
          {
            id: 'image',
            type: 'image_generation',
            position: { x: 0, y: 0 },
            data: {
              nodeType: 'image_generation',
              title: 'Image',
              config: {
                task: {
                  kind: 'image_generation',
                  mode: 'text_to_image',
                  provider: 'dev',
                  model: 'dev-image',
                  prompt: 'route test',
                  size: '1024x1024',
                  count: 1,
                },
              },
            },
          },
        ],
        edges: [],
      }),
    })
    const workflowPayload = (await createResponse.json()) as WorkflowResponse

    expect(createResponse.status).toBe(201)

    const runResponse = await app.request(`/api/workflows/${workflowPayload.item.id}/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        selectedNodeId: 'image',
        expectedWorkflowVersion: workflowPayload.item.version,
      }),
    })
    const runPayload = (await runResponse.json()) as WorkflowRunResponse

    expect(runResponse.status).toBe(201)
    expect(runPayload.item.status).toBe('running')
    expect(runPayload.item.nodeStates.image?.status).toBe('running')
  })

  test('workflow routes expose CRUD, node tasks, runs, run detail, and cancellation payloads', async () => {
    const app = createApp()
    const createResponse = await app.request('/api/workflows', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Route coverage workflow',
        nodes: [
          {
            id: 'image',
            type: 'image_generation',
            position: { x: 0, y: 0 },
            data: {
              nodeType: 'image_generation',
              title: 'Image',
              config: {
                task: {
                  kind: 'image_generation',
                  mode: 'text_to_image',
                  provider: 'dev',
                  model: 'dev-image',
                  prompt: 'route coverage',
                  size: '1024x1024',
                  count: 1,
                },
              },
            },
          },
        ],
        edges: [],
      }),
    })
    const workflowPayload = (await createResponse.json()) as WorkflowResponse

    const listResponse = await app.request('/api/workflows')
    const listPayload = (await listResponse.json()) as WorkflowListResponse
    expect(listResponse.status).toBe(200)
    expect(listPayload.items.some((workflow) => workflow.id === workflowPayload.item.id)).toBe(true)

    const detailResponse = await app.request(`/api/workflows/${workflowPayload.item.id}`)
    const detailPayload = (await detailResponse.json()) as WorkflowResponse
    expect(detailResponse.status).toBe(200)
    expect(detailPayload.item.id).toBe(workflowPayload.item.id)

    const updateResponse = await app.request(`/api/workflows/${workflowPayload.item.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Updated route coverage workflow',
        version: workflowPayload.item.version,
        nodes: workflowPayload.item.nodes,
        edges: workflowPayload.item.edges,
      }),
    })
    const updatedPayload = (await updateResponse.json()) as WorkflowResponse
    expect(updateResponse.status).toBe(200)
    expect(updatedPayload.item.version).toBe(workflowPayload.item.version + 1)

    const mediaViewResponse = await app.request(
      `/api/workflows/${updatedPayload.item.id}/nodes/image/media-view`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      },
    )
    const mediaViewPayload = (await mediaViewResponse.json()) as WorkflowResponse
    expect(mediaViewResponse.status).toBe(200)
    expect(mediaViewPayload.item.version).toBe(updatedPayload.item.version + 1)

    const nodeTasksResponse = await app.request(`/api/workflows/${updatedPayload.item.id}/nodes/image/tasks`)
    const nodeTasksPayload = (await nodeTasksResponse.json()) as TaskListResponse
    expect(nodeTasksResponse.status).toBe(200)
    expect(nodeTasksPayload.items).toEqual([])

    const runListBeforeResponse = await app.request(`/api/workflows/${updatedPayload.item.id}/runs`)
    const runListBeforePayload = (await runListBeforeResponse.json()) as WorkflowRunListResponse
    expect(runListBeforeResponse.status).toBe(200)
    expect(runListBeforePayload.items).toEqual([])

    const runResponse = await app.request(`/api/workflows/${updatedPayload.item.id}/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        selectedNodeId: 'image',
        expectedWorkflowVersion: mediaViewPayload.item.version,
      }),
    })
    const runPayload = (await runResponse.json()) as WorkflowRunResponse
    expect(runResponse.status).toBe(201)
    expect(runPayload.item.workflowId).toBe(updatedPayload.item.id)

    const runDetailResponse = await app.request(`/api/workflow-runs/${runPayload.item.id}`)
    const runDetailPayload = (await runDetailResponse.json()) as WorkflowRunResponse
    expect(runDetailResponse.status).toBe(200)
    expect(runDetailPayload.item.id).toBe(runPayload.item.id)

    const cancelRunResponse = await app.request(`/api/workflow-runs/${runPayload.item.id}/cancel`, {
      method: 'POST',
    })
    const cancelRunPayload = (await cancelRunResponse.json()) as CancelWorkflowRunResponse
    expect(cancelRunResponse.status).toBe(200)
    expect(cancelRunPayload.success).toBe(true)

    const deleteResponse = await app.request(`/api/workflows/${updatedPayload.item.id}`, {
      method: 'DELETE',
    })
    const deletePayload = (await deleteResponse.json()) as DeleteWorkflowResponse
    expect(deleteResponse.status).toBe(200)
    expect(deletePayload.success).toBe(true)
  })
})
