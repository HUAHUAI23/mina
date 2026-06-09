import { describe, expect, test } from 'bun:test'
import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import { ProjectResponseSchema, ProjectsOverviewResponseSchema } from '@mina/contracts/modules/projects'

import { createTestApp } from '../../test/app'

const readAuthToken = (value: unknown): string => {
  if (
    value &&
    typeof value === 'object' &&
    'session' in value &&
    value.session &&
    typeof value.session === 'object' &&
    'token' in value.session &&
    typeof value.session.token === 'string'
  ) {
    return value.session.token
  }
  throw new Error('Registration response did not include a session token.')
}

const readItemId = (value: unknown): string => {
  if (
    value &&
    typeof value === 'object' &&
    'item' in value &&
    value.item &&
    typeof value.item === 'object' &&
    'id' in value.item &&
    typeof value.item.id === 'string'
  ) {
    return value.item.id
  }
  throw new Error('Response did not include an item id.')
}

const register = async (app: ReturnType<typeof createTestApp>) => {
  const response = await app.request('/api/auth/register', {
    body: JSON.stringify({
      email: `projects-${crypto.randomUUID()}@example.com`,
      password: 'correct horse battery staple',
      username: `projects_${crypto.randomUUID().slice(0, 8)}`,
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
  expect(response.status).toBe(201)
  return readAuthToken(await response.json())
}

const createWorkflow = async (
  app: ReturnType<typeof createTestApp>,
  token: string,
  name: string,
  nodes: WorkflowCanvasNode[] = [],
) => {
  const response = await app.request('/api/workflows', {
    body: JSON.stringify({ edges: [], name, nodes }),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
  expect(response.status).toBe(201)
  return readItemId(await response.json())
}

const imageNode = (id: string): WorkflowCanvasNode => ({
  id,
  type: 'image_generation',
  position: { x: 0, y: 0 },
  data: {
    nodeType: 'image_generation',
    title: id,
    config: {
      task: {
        kind: 'image_generation',
        provider: 'dev',
        model: 'dev-image',
        prompt: id,
        params: {
          count: 1,
          size: '1024x1024',
        },
      },
    },
  },
})

const runWorkflow = async (app: ReturnType<typeof createTestApp>, token: string, workflowId: string, selectedNodeId: string) => {
  const runResponse = await app.request(`/api/workflows/${workflowId}/runs`, {
    body: JSON.stringify({ selectedNodeId }),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
  expect(runResponse.status).toBe(201)

  for (let index = 0; index < 3; index += 1) {
    await app.runBackgroundCycleForTest()
  }

  const runsResponse = await app.request(`/api/workflows/${workflowId}/runs`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(runsResponse.status).toBe(200)
}

describe('project routes', () => {
  test('returns projects and ungrouped canvases in the overview', async () => {
    const app = createTestApp()
    const token = await register(app)
    const firstWorkflowId = await createWorkflow(app, token, 'First canvas')
    const secondWorkflowId = await createWorkflow(app, token, 'Second canvas')

    const createProjectResponse = await app.request('/api/projects/from-workflows', {
      body: JSON.stringify({
        sourceWorkflowId: firstWorkflowId,
        targetWorkflowId: secondWorkflowId,
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })

    expect(createProjectResponse.status).toBe(201)
    const createProjectPayload = ProjectResponseSchema.parse(await createProjectResponse.json())
    expect(createProjectPayload.item.workflows.map((workflow: { id: string }) => workflow.id)).toEqual([
      secondWorkflowId,
      firstWorkflowId,
    ])

    const overviewResponse = await app.request('/api/projects/overview', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(overviewResponse.status).toBe(200)
    const overview = ProjectsOverviewResponseSchema.parse(await overviewResponse.json())
    expect(overview.projects).toHaveLength(1)
    expect(overview.projects.at(0)?.workflows).toHaveLength(2)
    expect(overview.ungroupedWorkflows).toEqual([])
  })

  test('returns the latest generated image as workflow card preview', async () => {
    const app = createTestApp()
    const token = await register(app)
    const workflowId = await createWorkflow(app, token, 'Preview canvas', [imageNode('image')])
    await runWorkflow(app, token, workflowId, 'image')
    const firstOverviewResponse = await app.request('/api/projects/overview', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(firstOverviewResponse.status).toBe(200)
    const firstOverview = ProjectsOverviewResponseSchema.parse(await firstOverviewResponse.json())
    const firstPreview = firstOverview.ungroupedWorkflows.find((workflow) => workflow.id === workflowId)?.previewImage
    expect(firstPreview?.kind).toBe('image')
    expect(firstPreview?.mediaObjectId).toMatch(/^media_/)

    await runWorkflow(app, token, workflowId, 'image')

    const overviewResponse = await app.request('/api/projects/overview', {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(overviewResponse.status).toBe(200)
    const overview = ProjectsOverviewResponseSchema.parse(await overviewResponse.json())
    const latestPreview = overview.ungroupedWorkflows.find((workflow) => workflow.id === workflowId)?.previewImage
    expect(latestPreview?.kind).toBe('image')
    expect(latestPreview?.mediaObjectId).toMatch(/^media_/)
    expect(latestPreview?.mediaObjectId).not.toBe(firstPreview?.mediaObjectId)
  })

  test('adds an ungrouped canvas to an existing project', async () => {
    const app = createTestApp()
    const token = await register(app)
    const firstWorkflowId = await createWorkflow(app, token, 'First canvas')
    const secondWorkflowId = await createWorkflow(app, token, 'Second canvas')
    const thirdWorkflowId = await createWorkflow(app, token, 'Third canvas')

    const createProjectResponse = await app.request('/api/projects/from-workflows', {
      body: JSON.stringify({
        name: 'Scene pack',
        sourceWorkflowId: firstWorkflowId,
        targetWorkflowId: secondWorkflowId,
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
    const projectId = readItemId(await createProjectResponse.json())

    const addResponse = await app.request(`/api/projects/${projectId}/workflows`, {
      body: JSON.stringify({ workflowId: thirdWorkflowId }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })

    expect(addResponse.status).toBe(200)
    const addPayload = ProjectResponseSchema.parse(await addResponse.json())
    expect(addPayload.item.workflows.map((workflow: { id: string }) => workflow.id)).toEqual([
      secondWorkflowId,
      firstWorkflowId,
      thirdWorkflowId,
    ])
  })

  test('returns project detail and removes a canvas from the project', async () => {
    const app = createTestApp()
    const token = await register(app)
    const firstWorkflowId = await createWorkflow(app, token, 'First canvas')
    const secondWorkflowId = await createWorkflow(app, token, 'Second canvas')

    const createProjectResponse = await app.request('/api/projects/from-workflows', {
      body: JSON.stringify({
        name: 'Editorial set',
        sourceWorkflowId: firstWorkflowId,
        targetWorkflowId: secondWorkflowId,
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
    expect(createProjectResponse.status).toBe(201)
    const projectId = readItemId(await createProjectResponse.json())

    const detailResponse = await app.request(`/api/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(detailResponse.status).toBe(200)
    const detail = ProjectResponseSchema.parse(await detailResponse.json())
    expect(detail.item.workflows.map((workflow: { id: string }) => workflow.id)).toEqual([
      secondWorkflowId,
      firstWorkflowId,
    ])

    const removeResponse = await app.request(`/api/projects/${projectId}/workflows/${firstWorkflowId}`, {
      headers: { Authorization: `Bearer ${token}` },
      method: 'DELETE',
    })
    expect(removeResponse.status).toBe(200)

    const overviewResponse = await app.request('/api/projects/overview', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(overviewResponse.status).toBe(200)
    const overview = ProjectsOverviewResponseSchema.parse(await overviewResponse.json())
    expect(overview.projects.at(0)?.workflows.map((workflow: { id: string }) => workflow.id)).toEqual([secondWorkflowId])
    expect(overview.ungroupedWorkflows.map((workflow: { id: string }) => workflow.id)).toEqual([firstWorkflowId])
  })

  test('rejects duplicate project membership with a stable error code', async () => {
    const app = createTestApp()
    const token = await register(app)
    const firstWorkflowId = await createWorkflow(app, token, 'First canvas')
    const secondWorkflowId = await createWorkflow(app, token, 'Second canvas')
    const thirdWorkflowId = await createWorkflow(app, token, 'Third canvas')

    await app.request('/api/projects/from-workflows', {
      body: JSON.stringify({
        sourceWorkflowId: firstWorkflowId,
        targetWorkflowId: secondWorkflowId,
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })

    const duplicateResponse = await app.request('/api/projects/from-workflows', {
      body: JSON.stringify({
        sourceWorkflowId: firstWorkflowId,
        targetWorkflowId: thirdWorkflowId,
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })

    expect(duplicateResponse.status).toBe(409)
    expect(await duplicateResponse.json()).toMatchObject({
      error: {
        code: 'WORKFLOW_ALREADY_IN_PROJECT',
      },
    })
  })

  test('releases project canvases after deleting a project', async () => {
    const app = createTestApp()
    const token = await register(app)
    const firstWorkflowId = await createWorkflow(app, token, 'First canvas')
    const secondWorkflowId = await createWorkflow(app, token, 'Second canvas')

    const createProjectResponse = await app.request('/api/projects/from-workflows', {
      body: JSON.stringify({
        sourceWorkflowId: firstWorkflowId,
        targetWorkflowId: secondWorkflowId,
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
    expect(createProjectResponse.status).toBe(201)
    const projectId = readItemId(await createProjectResponse.json())

    const deleteResponse = await app.request(`/api/projects/${projectId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      method: 'DELETE',
    })

    expect(deleteResponse.status).toBe(200)

    const overviewResponse = await app.request('/api/projects/overview', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(overviewResponse.status).toBe(200)
    const overview = ProjectsOverviewResponseSchema.parse(await overviewResponse.json())
    expect(overview.projects).toHaveLength(0)
    expect(overview.ungroupedWorkflows.map((workflow: { id: string }) => workflow.id).sort()).toEqual(
      [firstWorkflowId, secondWorkflowId].sort(),
    )

    const recreateResponse = await app.request('/api/projects/from-workflows', {
      body: JSON.stringify({
        sourceWorkflowId: firstWorkflowId,
        targetWorkflowId: secondWorkflowId,
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })

    expect(recreateResponse.status).toBe(201)
  })
})
