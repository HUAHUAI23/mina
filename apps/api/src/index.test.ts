import { describe, expect, test } from 'bun:test'
import type { ApiError, PostResponse, TaskResponse, WorkflowResponse, WorkflowRunResponse } from '@mina/contracts'

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
})
