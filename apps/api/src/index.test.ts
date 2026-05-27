import { describe, expect, test } from 'bun:test'
import type { AuthResponse } from '@mina/contracts/modules/accounts'
import type {
  CancelTaskResponse,
  TaskListResponse,
  TaskResourceListResponse,
  TaskResponse,
} from '@mina/contracts/modules/tasks'
import type { TaskModelCatalogResponse } from '@mina/contracts/modules/tasks/model-catalog'
import type { MediaObjectResponse } from '@mina/contracts/modules/media/media-object'
import type {
  CancelWorkflowRunResponse,
  DeleteWorkflowResponse,
  WorkflowListResponse,
  WorkflowNodeTaskHistoryResponse,
  WorkflowResponse,
  WorkflowRunListResponse,
  WorkflowRunResponse,
} from '@mina/contracts/modules/workflows'
import type { ApiError } from '@mina/contracts/schemas/api-error'
import { hc } from 'hono/client'
import type { AppType } from './index'

import { createTestApp } from './test/app'

describe('mina api', () => {
  const app = createTestApp()

  const registerAndAuthHeaders = async (username = `user_${crypto.randomUUID().slice(0, 8)}`) => {
    const response = await app.request('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: `${username}@example.com`,
        password: 'correct horse battery staple',
        username,
      }),
    })
    const payload = (await response.json()) as AuthResponse
    return {
      auth: payload,
      headers: {
        Authorization: `Bearer ${payload.session.token}`,
        'Content-Type': 'application/json',
      },
    }
  }

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

  test(
    'POST /api/auth/register creates a user session with username password auth',
    async () => {
      const app = createTestApp()
      const response = await app.request('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          displayName: 'Mina Admin',
          email: 'admin@example.com',
          password: 'correct horse battery staple',
          username: 'mina_admin',
        }),
      })
      const payload = (await response.json()) as AuthResponse

      expect(response.status).toBe(201)
      expect(payload.user.email).toBe('admin@example.com')
      expect(payload.user.username).toBe('mina_admin')
      expect(payload.session.token.length).toBeGreaterThanOrEqual(32)

      const workflowResponse = await app.request('/api/workflows', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${payload.session.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Registered user workflow',
          nodes: [],
          edges: [],
        }),
      })
      const workflow = (await workflowResponse.json()) as WorkflowResponse
      expect(workflowResponse.status).toBe(201)
      expect(workflow.item.accountId).not.toBe('demo-account')
    },
    10_000,
  )

  test(
    'POST /api/auth/login authenticates with username and password',
    async () => {
      const app = createTestApp()
      await app.request('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'director@example.com',
          password: 'correct horse battery staple',
          username: 'director',
        }),
      })

      const response = await app.request('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          identifier: 'director',
          password: 'correct horse battery staple',
        }),
      })
      const payload = (await response.json()) as AuthResponse

      expect(response.status).toBe(200)
      expect(payload.user.username).toBe('director')
      expect(payload.session.userId).toBe(payload.user.id)
    },
    10_000,
  )

  test('POST /api/auth/login rejects invalid credentials', async () => {
    const response = await app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        identifier: 'missing',
        password: 'incorrect password',
      }),
    })
    const payload = (await response.json()) as ApiError

    expect(response.status).toBe(401)
    expect(payload.error.code).toBe('INVALID_CREDENTIALS')
    expect(payload.error.message).toBe('Invalid username or password.')
    expect(payload.error.locale).toBe('en')
  })

  test('localizes missing route errors from the locale header', async () => {
    const response = await app.request('/api/missing', {
      headers: {
        'X-Mina-Locale': 'zh-Hans',
      },
    })
    const payload = (await response.json()) as ApiError

    expect(response.status).toBe(404)
    expect(payload.error.code).toBe('NOT_FOUND')
    expect(payload.error.locale).toBe('zh-Hans')
    expect(payload.error.message).toBe('未找到请求的路由。')
  })

  test('falls back to English for unsupported locale headers', async () => {
    const response = await app.request('/api/missing', {
      headers: {
        'X-Mina-Locale': 'fr-FR',
      },
    })
    const payload = (await response.json()) as ApiError

    expect(response.status).toBe(404)
    expect(payload.error.code).toBe('NOT_FOUND')
    expect(payload.error.locale).toBe('en')
    expect(payload.error.message).toBe('Route not found.')
  })

  test('keeps auth failure codes stable across localized messages', async () => {
    const response = await app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Mina-Locale': 'zh-Hans',
      },
      body: JSON.stringify({
        identifier: 'missing',
        password: 'incorrect password',
      }),
    })
    const payload = (await response.json()) as ApiError

    expect(response.status).toBe(401)
    expect(payload.error.code).toBe('INVALID_CREDENTIALS')
    expect(payload.error.locale).toBe('zh-Hans')
    expect(payload.error.message).toBe('用户名或密码错误。')
  })

  test('returns structured validation issues for invalid requests', async () => {
    const response = await app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Mina-Locale': 'zh-Hans',
      },
      body: JSON.stringify({
        identifier: '',
        password: 'short',
      }),
    })
    const payload = (await response.json()) as ApiError

    expect(response.status).toBe(400)
    expect(payload.error.code).toBe('VALIDATION_FAILED')
    expect(payload.error.locale).toBe('zh-Hans')
    expect(payload.error.message).toBe('请求参数无效。')
    expect(payload.error.issues?.length).toBeGreaterThan(0)
    expect(payload.error.issues?.[0]).toEqual(
      expect.objectContaining({
        code: expect.any(String),
        path: expect.any(Array),
      }),
    )
  })

  test('POST /api/tasks creates an independently runnable task', async () => {
    const { headers } = await registerAndAuthHeaders()
    const response = await app.request('/api/tasks', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        config: {
          kind: 'image_generation',
          provider: 'dev',
          model: 'dev-image',
          prompt: 'route task',
          params: {
            count: 1,
            size: '1024x1024',
          },
        },
      }),
    })
    const payload = (await response.json()) as TaskResponse

    expect(response.status).toBe(201)
    expect(payload.item.status).toBe('queued')
  })

  test('task routes expose list, detail, resources, and cancellation payloads', async () => {
    const { headers } = await registerAndAuthHeaders()
    const createResponse = await app.request('/api/tasks', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        config: {
          kind: 'image_generation',
          provider: 'dev',
          model: 'dev-image',
          prompt: 'route task coverage',
          params: {
            count: 1,
            size: '1024x1024',
          },
        },
      }),
    })
    const created = (await createResponse.json()) as TaskResponse

    const listResponse = await app.request('/api/tasks', { headers })
    const listPayload = (await listResponse.json()) as TaskListResponse
    expect(listResponse.status).toBe(200)
    expect(listPayload.items.some((task) => task.id === created.item.id)).toBe(true)

    const detailResponse = await app.request(`/api/tasks/${created.item.id}`, { headers })
    const detailPayload = (await detailResponse.json()) as TaskResponse
    expect(detailResponse.status).toBe(200)
    expect(detailPayload.item.id).toBe(created.item.id)

    const resourcesResponse = await app.request(`/api/tasks/${created.item.id}/resources`, { headers })
    const resourcesPayload = (await resourcesResponse.json()) as TaskResourceListResponse
    expect(resourcesResponse.status).toBe(200)
    expect(resourcesPayload.items).toEqual([])

    const cancelResponse = await app.request(`/api/tasks/${created.item.id}/cancel`, {
      method: 'POST',
      headers,
    })
    const cancelPayload = (await cancelResponse.json()) as CancelTaskResponse
    expect(cancelResponse.status).toBe(200)
    expect(cancelPayload.success).toBe(true)
  })

  test('task routes hide resources from other accounts', async () => {
    const owner = await registerAndAuthHeaders()
    const other = await registerAndAuthHeaders()
    const createResponse = await app.request('/api/tasks', {
      method: 'POST',
      headers: owner.headers,
      body: JSON.stringify({
        config: {
          kind: 'image_generation',
          provider: 'dev',
          model: 'dev-image',
          prompt: 'private route task',
          params: {
            count: 1,
            size: '1024x1024',
          },
        },
      }),
    })
    const created = (await createResponse.json()) as TaskResponse

    const detailResponse = await app.request(`/api/tasks/${created.item.id}`, { headers: other.headers })
    const resourcesResponse = await app.request(`/api/tasks/${created.item.id}/resources`, { headers: other.headers })
    const cancelResponse = await app.request(`/api/tasks/${created.item.id}/cancel`, {
      method: 'POST',
      headers: other.headers,
    })

    expect(detailResponse.status).toBe(404)
    expect(resourcesResponse.status).toBe(404)
    expect(cancelResponse.status).toBe(404)
  })

  test('GET /api/tasks/models exposes public model descriptors', async () => {
    const app = createTestApp()
    const response = await app.request('/api/tasks/models')
    const payload = (await response.json()) as TaskModelCatalogResponse

    expect(response.status).toBe(200)
    expect(payload.items.some((item) => item.provider === 'dev' && item.model === 'dev-image')).toBe(true)
    expect(payload.items.every((item) => item.displayName.length > 0)).toBe(true)
  })

  test('media object routes create, fetch, reject unsupported uploads, and complete presigned uploads', async () => {
    const { auth } = await registerAndAuthHeaders()
    const authHeaders = { Authorization: `Bearer ${auth.session.token}` }
    const formData = new FormData()
    formData.set('file', new File([new TextEncoder().encode('image-bytes')], 'input.png', { type: 'image/png' }))
    formData.set('purpose', 'workflow_slot')
    formData.set('retention', 'project_scoped')

    const createResponse = await app.request('/api/media-objects', {
      method: 'POST',
      headers: authHeaders,
      body: formData,
    })
    const created = (await createResponse.json()) as MediaObjectResponse
    expect(createResponse.status).toBe(201)
    expect(created.item.status).toBe('ready')
    expect(created.item.kind).toBe('image')

    const getResponse = await app.request(`/api/media-objects/${created.item.id}`, { headers: authHeaders })
    const fetched = (await getResponse.json()) as MediaObjectResponse
    expect(getResponse.status).toBe(200)
    expect(fetched.item.id).toBe(created.item.id)

    const unsupported = new FormData()
    unsupported.set('file', new File(['plain'], 'plain.txt', { type: 'text/plain' }))
    const unsupportedResponse = await app.request('/api/media-objects', {
      method: 'POST',
      headers: authHeaders,
      body: unsupported,
    })
    expect(unsupportedResponse.status).toBe(415)

    const presignedResponse = await app.request('/api/media-objects/presigned-upload', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'video',
        mimeType: 'video/mp4',
        byteSize: 1024,
        purpose: 'workflow_slot',
        retention: 'project_scoped',
      }),
    })
    const presigned = (await presignedResponse.json()) as {
      item: MediaObjectResponse['item']
      storageKey: string
    }
    expect(presignedResponse.status).toBe(201)
    expect(presigned.item.status).toBe('uploading')

    const completeResponse = await app.request(`/api/media-objects/${presigned.item.id}/complete-upload`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ storageKey: presigned.storageKey }),
    })
    const completed = (await completeResponse.json()) as MediaObjectResponse
    expect(completeResponse.status).toBe(200)
    expect(completed.item.status).toBe('ready')
  })

  test('media object routes require admin role for public library uploads', async () => {
    const { auth } = await registerAndAuthHeaders('public_library_user')
    const authHeaders = { Authorization: `Bearer ${auth.session.token}` }
    const formData = new FormData()
    formData.set('file', new File([new TextEncoder().encode('image-bytes')], 'public.png', { type: 'image/png' }))
    formData.set('purpose', 'public_library')
    formData.set('retention', 'library')

    const createResponse = await app.request('/api/media-objects', {
      method: 'POST',
      headers: authHeaders,
      body: formData,
    })
    const createPayload = (await createResponse.json()) as ApiError
    expect(createResponse.status).toBe(403)
    expect(createPayload.error.code).toBe('ADMIN_REQUIRED')

    const presignedResponse = await app.request('/api/media-objects/presigned-upload', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'image',
        mimeType: 'image/png',
        purpose: 'public_library',
        retention: 'library',
      }),
    })
    const presignedPayload = (await presignedResponse.json()) as ApiError
    expect(presignedResponse.status).toBe(403)
    expect(presignedPayload.error.code).toBe('ADMIN_REQUIRED')
  })

  test('Hono RPC client uploads media objects with object form fields', async () => {
    const { headers } = await registerAndAuthHeaders('rpc_upload_user')
    const client = hc<AppType>('http://localhost', {
      fetch: app.request,
      headers: { Authorization: headers.Authorization },
    })

    const response = await client.api['media-objects'].$post({
      form: {
        file: new File([new TextEncoder().encode('image-bytes')], 'input.png', { type: 'image/png' }),
        purpose: 'workflow_slot',
        retention: 'project_scoped',
      },
    })
    const payload = (await response.json()) as MediaObjectResponse

    expect(response.status).toBe(201)
    expect(payload.item.kind).toBe('image')
    expect(payload.item.status).toBe('ready')
  })

  test('POST /api/workflows/:id/runs executes an isolated image node', async () => {
    const { headers } = await registerAndAuthHeaders()
    const createResponse = await app.request('/api/workflows', {
      method: 'POST',
      headers,
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
                  provider: 'dev',
                  model: 'dev-image',
                  prompt: 'route test',
                  params: {
                    count: 1,
                    size: '1024x1024',
                  },
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
      headers,
      body: JSON.stringify({ selectedNodeId: 'image' }),
    })
    const runPayload = (await runResponse.json()) as WorkflowRunResponse

    expect(runResponse.status).toBe(201)
    expect(runPayload.item.status).toBe('running')
    expect(runPayload.item.nodeStates.image?.status).toBe('running')
  })

  test(
    'workflow routes expose create/list/detail, node tasks, runs, run detail, and cancellation payloads',
    async () => {
      const { headers } = await registerAndAuthHeaders()
      const createResponse = await app.request('/api/workflows', {
        method: 'POST',
        headers,
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
                    provider: 'dev',
                    model: 'dev-image',
                    prompt: 'route coverage',
                    params: {
                      count: 1,
                      size: '1024x1024',
                    },
                  },
                },
              },
            },
          ],
          edges: [],
        }),
      })
      const workflowPayload = (await createResponse.json()) as WorkflowResponse

      const listResponse = await app.request('/api/workflows', { headers })
      const listPayload = (await listResponse.json()) as WorkflowListResponse
      expect(listResponse.status).toBe(200)
      expect(listPayload.items.some((workflow) => workflow.id === workflowPayload.item.id)).toBe(true)

      const detailResponse = await app.request(`/api/workflows/${workflowPayload.item.id}`, { headers })
      const detailPayload = (await detailResponse.json()) as WorkflowResponse
      expect(detailResponse.status).toBe(200)
      expect(detailPayload.item.id).toBe(workflowPayload.item.id)

      const nodeTasksResponse = await app.request(`/api/workflows/${workflowPayload.item.id}/nodes/image/tasks`, { headers })
      const nodeTasksPayload = (await nodeTasksResponse.json()) as WorkflowNodeTaskHistoryResponse
      expect(nodeTasksResponse.status).toBe(200)
      expect(nodeTasksPayload.items).toEqual([])

      const runListBeforeResponse = await app.request(`/api/workflows/${workflowPayload.item.id}/runs`, { headers })
      const runListBeforePayload = (await runListBeforeResponse.json()) as WorkflowRunListResponse
      expect(runListBeforeResponse.status).toBe(200)
      expect(runListBeforePayload.items).toEqual([])

      const runResponse = await app.request(`/api/workflows/${workflowPayload.item.id}/runs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ selectedNodeId: 'image' }),
      })
      const runPayload = (await runResponse.json()) as WorkflowRunResponse
      expect(runResponse.status).toBe(201)
      expect(runPayload.item.workflowId).toBe(workflowPayload.item.id)

      const runDetailResponse = await app.request(`/api/workflow-runs/${runPayload.item.id}`, { headers })
      const runDetailPayload = (await runDetailResponse.json()) as WorkflowRunResponse
      expect(runDetailResponse.status).toBe(200)
      expect(runDetailPayload.item.id).toBe(runPayload.item.id)

      const cancelRunResponse = await app.request(`/api/workflow-runs/${runPayload.item.id}/cancel`, {
        method: 'POST',
        headers,
      })
      const cancelRunPayload = (await cancelRunResponse.json()) as CancelWorkflowRunResponse
      expect(cancelRunResponse.status).toBe(200)
      expect(cancelRunPayload.success).toBe(true)

      const deleteResponse = await app.request(`/api/workflows/${workflowPayload.item.id}`, {
        method: 'DELETE',
        headers,
      })
      const deletePayload = (await deleteResponse.json()) as DeleteWorkflowResponse
      expect(deleteResponse.status).toBe(200)
      expect(deletePayload.success).toBe(true)
    },
    10_000,
  )

  test('workflow routes hide resources from other accounts', async () => {
    const owner = await registerAndAuthHeaders()
    const other = await registerAndAuthHeaders()
    const createResponse = await app.request('/api/workflows', {
      method: 'POST',
      headers: owner.headers,
      body: JSON.stringify({
        name: 'Private workflow',
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
                  provider: 'dev',
                  model: 'dev-image',
                  prompt: 'private workflow',
                  params: {
                    count: 1,
                    size: '1024x1024',
                  },
                },
              },
            },
          },
        ],
        edges: [],
      }),
    })
    const workflowPayload = (await createResponse.json()) as WorkflowResponse
    const runResponse = await app.request(`/api/workflows/${workflowPayload.item.id}/runs`, {
      method: 'POST',
      headers: owner.headers,
      body: JSON.stringify({ selectedNodeId: 'image' }),
    })
    const runPayload = (await runResponse.json()) as WorkflowRunResponse

    const detailResponse = await app.request(`/api/workflows/${workflowPayload.item.id}`, { headers: other.headers })
    const runsResponse = await app.request(`/api/workflows/${workflowPayload.item.id}/runs`, { headers: other.headers })
    const runDetailResponse = await app.request(`/api/workflow-runs/${runPayload.item.id}`, { headers: other.headers })
    const cancelRunResponse = await app.request(`/api/workflow-runs/${runPayload.item.id}/cancel`, {
      method: 'POST',
      headers: other.headers,
    })

    expect(detailResponse.status).toBe(404)
    expect(runsResponse.status).toBe(404)
    expect(runDetailResponse.status).toBe(404)
    expect(cancelRunResponse.status).toBe(404)
  })
})
