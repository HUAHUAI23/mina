import { expect, test } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'

interface AuthResponse {
  session: {
    expiresAt: string
    id: string
    token: string
    userId: string
  }
  user: {
    createdAt: string
    email: string
    id: string
    role: string
    updatedAt: string
    username?: string
  }
}

interface WorkflowCreateResponse {
  item: {
    id: string
    version: number
  }
}

interface WorkflowDetailResponse {
  item: {
    id: string
    nodes: Array<{
      id: string
      position: {
        x: number
        y: number
      }
    }>
    version: number
  }
}

interface CanvasPerfCounters {
  autosaveStarts: number
  documentCommits: number
  edgesChangeEvents: number
  nodesChangeEvents: number
  renderStateWrites: number
  websocketReconnects: number
  yjsUpdatesReceived: number
  yjsUpdatesSent: number
}

interface CanvasProfilerCommit {
  actualDuration: number
  baseDuration: number
  commitTime: number
  id: string
  phase: 'mount' | 'nested-update' | 'update'
  startTime: number
}

declare global {
  interface Window {
    __minaWorkflowCanvasPerf?: CanvasPerfCounters
    __minaWorkflowCanvasProfiler?: CanvasProfilerCommit[]
    __minaWorkflowCanvasRenderCounts?: Record<string, number>
    __minaWorkflowCanvasYjs?: {
      matchesDocument(): boolean
    }
  }
}

interface VisibleNodeTarget {
  id: string
  x: number
  y: number
}

const apiBaseUrl = 'http://127.0.0.1:3001'
const authStorageKey = 'mina.auth.session'

const textNode = (id: string, index: number) => ({
  id,
  type: 'text',
  position: { x: index * 260, y: 0 },
  width: 220,
  data: {
    nodeType: 'text',
    title: `Text ${index}`,
    config: { text: `Note ${index}` },
  },
})

const imageNode = (id: string, index: number, sourceNodeId?: string) => ({
  id,
  type: 'image_generation',
  position: { x: index * 300, y: 240 },
  width: 240,
  data: {
    nodeType: 'image_generation',
    title: `Image ${index}`,
    config: {
      task: {
        kind: 'image_generation',
        provider: 'dev',
        model: 'dev-image',
        prompt: `Prompt ${index}`,
        params: { count: 1, size: '1024x1024' },
      },
    },
    ...(sourceNodeId
      ? {
          mediaSlots: {
            inputImages: [
              {
                id: `slot_${id}`,
                order: 0,
                required: true,
                slot: 'inputImages',
                source: { type: 'node_output', nodeId: sourceNodeId, resolve: 'current_media' },
              },
            ],
          },
        }
      : {}),
  },
})

const videoNode = (id: string, index: number, sourceNodeId?: string) => ({
  id,
  type: 'video_generation',
  position: { x: index * 300, y: 480 },
  width: 260,
  data: {
    nodeType: 'video_generation',
    title: `Video ${index}`,
    config: {
      task: {
        kind: 'video_generation',
        provider: 'dev',
        model: 'dev-video',
        prompt: `Motion ${index}`,
        params: { durationSeconds: 5, outputLastFrame: false, resolution: '720p' },
      },
    },
    ...(sourceNodeId
      ? {
          mediaSlots: {
            firstFrame: [
              {
                id: `slot_${id}`,
                order: 0,
                required: true,
                slot: 'firstFrame',
                source: { type: 'node_output', nodeId: sourceNodeId, resolve: 'current_media' },
              },
            ],
          },
        }
      : {}),
  },
})

const edge = (id: string, source: string, target: string, slotItemId: string, targetSlot = 'inputImages') => ({
  id,
  type: 'media',
  source,
  target,
  data: {
    connection: {
      kind: 'media_link',
      targetSlot,
      targetSlotItemId: slotItemId,
    },
  },
})

const createWorkflowFixture = (nodeCount: number) => {
  const nodes = Array.from({ length: nodeCount }, (_unused, index) => {
    if (index % 10 === 9) return textNode(`node_${index}`, index)
    if (index % 5 === 4) return videoNode(`node_${index}`, index, `node_${index - 1}`)
    return imageNode(`node_${index}`, index, index > 0 ? `node_${index - 1}` : undefined)
  })
  const edges = nodes.flatMap((node, index) => {
    if (index === 0 || node.type === 'text') return []
    return [
      edge(
        `edge_${index}`,
        `node_${index - 1}`,
        node.id,
        `slot_${node.id}`,
        node.type === 'video_generation' ? 'firstFrame' : 'inputImages',
      ),
    ]
  })
  return { edges, nodes }
}

const register = async (request: APIRequestContext): Promise<AuthResponse> => {
  const suffix = Date.now().toString(36)
  const response = await request.post(`${apiBaseUrl}/api/auth/register`, {
    data: {
      email: `workflow-canvas-${suffix}@example.com`,
      password: 'correct horse battery staple',
      username: `canvas_${suffix}`,
    },
  })
  expect(response.ok()).toBe(true)
  return response.json() as Promise<AuthResponse>
}

const createWorkflow = async (
  request: APIRequestContext,
  token: string,
  nodeCount: number,
): Promise<WorkflowCreateResponse> => {
  const response = await request.post(`${apiBaseUrl}/api/workflows`, {
    data: {
      name: `Canvas Perf ${nodeCount}`,
      ...createWorkflowFixture(nodeCount),
    },
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(response.ok()).toBe(true)
  return response.json() as Promise<WorkflowCreateResponse>
}

const getWorkflowDetail = async (
  request: APIRequestContext,
  token: string,
  workflowId: string,
): Promise<WorkflowDetailResponse> => {
  const response = await request.get(`${apiBaseUrl}/api/workflows/${workflowId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(response.ok()).toBe(true)
  return response.json() as Promise<WorkflowDetailResponse>
}

const installAuthSession = async (page: Page, auth: AuthResponse) => {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, JSON.stringify(value)),
    [authStorageKey, auth],
  )
}

const readPerf = async (page: Page): Promise<CanvasPerfCounters> =>
  page.evaluate(() => {
    if (!window.__minaWorkflowCanvasPerf) {
      throw new Error('Canvas performance counters are not installed.')
    }
    return { ...window.__minaWorkflowCanvasPerf }
  })

const firstVisibleDraggableNode = async (page: Page): Promise<VisibleNodeTarget> =>
  page.locator('.react-flow__node.draggable').evaluateAll((nodes) => {
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    for (const node of nodes) {
      const rect = node.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      if (
        rect.width > 0 &&
        rect.height > 0 &&
        centerX >= 0 &&
        centerX <= viewportWidth &&
        centerY >= 0 &&
        centerY <= viewportHeight
      ) {
        const id = node.getAttribute('data-id')
        if (!id) {
          continue
        }
        return { id, x: centerX, y: centerY }
      }
    }
    throw new Error('No draggable React Flow node is visible in the viewport.')
  })

const firstVisibleDraggableNodeExcept = async (page: Page, excludedNodeId: string): Promise<VisibleNodeTarget> =>
  page.locator('.react-flow__node.draggable').evaluateAll((nodes, excluded) => {
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    for (const node of nodes) {
      const id = node.getAttribute('data-id')
      if (!id || id === excluded) {
        continue
      }
      const rect = node.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      if (
        rect.width > 0 &&
        rect.height > 0 &&
        centerX >= 0 &&
        centerX <= viewportWidth &&
        centerY >= 0 &&
        centerY <= viewportHeight
      ) {
        return { id, x: centerX, y: centerY }
      }
    }
    throw new Error('No secondary draggable React Flow node is visible in the viewport.')
  }, excludedNodeId)

const visibleDraggableNodes = async (page: Page, count: number): Promise<VisibleNodeTarget[]> =>
  page.locator('.react-flow__node.draggable').evaluateAll((nodes, requestedCount) => {
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const visible: VisibleNodeTarget[] = []
    for (const node of nodes) {
      const id = node.getAttribute('data-id')
      if (!id) {
        continue
      }
      const rect = node.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const y = rect.top + rect.height / 2
      if (rect.width > 0 && rect.height > 0 && x >= 0 && x <= viewportWidth && y >= 0 && y <= viewportHeight) {
        visible.push({ id, x, y })
      }
      if (visible.length >= requestedCount) {
        return visible
      }
    }
    throw new Error(`Expected ${requestedCount} visible draggable React Flow nodes, found ${visible.length}.`)
  }, count)

const readRenderCount = async (page: Page, nodeId: string): Promise<number> =>
  page.evaluate((id) => window.__minaWorkflowCanvasRenderCounts?.[id] ?? 0, nodeId)

const readProfilerCommits = async (page: Page): Promise<CanvasProfilerCommit[]> =>
  page.evaluate(() => window.__minaWorkflowCanvasProfiler?.map((commit) => ({ ...commit })) ?? [])

test('workflow canvas drag/save/reload keeps document commits bounded and Yjs parity intact', async ({ page, request }) => {
  const auth = await register(request)
  const workflow = await createWorkflow(request, auth.session.token, 20)
  await installAuthSession(page, auth)

  await page.goto(`/canvas/${workflow.item.id}`)
  await expect
    .poll(() =>
      page.evaluate(
        (workflowId) =>
          performance
            .getEntriesByType('resource')
            .some((entry) => entry.name.includes(`/api/workflows/${workflowId}/collab/snapshot`)),
        workflow.item.id,
      ),
    )
    .toBe(true)
  await page.locator('.react-flow').waitFor()
  await expect(page.locator('.react-flow__node').first()).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__minaWorkflowCanvasYjs?.matchesDocument?.())).toBe(true)

  const before = await readPerf(page)
  const profilerBefore = await readProfilerCommits(page)
  const target = await firstVisibleDraggableNode(page)
  const unrelatedTarget = await firstVisibleDraggableNodeExcept(page, target.id)
  const unrelatedRenderCountBefore = await readRenderCount(page, unrelatedTarget.id)
  const persistedBefore = await getWorkflowDetail(request, auth.session.token, workflow.item.id)
  const nodeBefore = persistedBefore.item.nodes.find((node) => node.id === target.id)
  if (!nodeBefore) throw new Error(`Workflow API did not return node ${target.id}.`)

  await page.mouse.move(target.x, target.y)
  await page.mouse.down()
  await page.mouse.move(target.x + 180, target.y + 90, { steps: 20 })

  const duringDrag = await readPerf(page)
  const profilerDuringDrag = await readProfilerCommits(page).then((commits) => commits.slice(profilerBefore.length))
  expect(duringDrag.autosaveStarts).toBe(before.autosaveStarts)
  expect(await readRenderCount(page, unrelatedTarget.id)).toBe(unrelatedRenderCountBefore)
  expect(profilerDuringDrag.length).toBeGreaterThan(0)
  expect(Math.max(...profilerDuringDrag.map((commit) => commit.actualDuration))).toBeLessThan(50)

  await page.mouse.up()
  await expect
    .poll(async () => (await readPerf(page)).documentCommits - before.documentCommits)
    .toBe(1)
  await expect
    .poll(async () => (await readPerf(page)).autosaveStarts - before.autosaveStarts)
    .toBeGreaterThanOrEqual(1)

  await page.getByRole('button', { name: /save/i }).click()
  await expect(page.getByText('Saved')).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__minaWorkflowCanvasYjs?.matchesDocument?.())).toBe(true)
  await expect
    .poll(async () => {
      const persistedAfter = await getWorkflowDetail(request, auth.session.token, workflow.item.id)
      const nodeAfter = persistedAfter.item.nodes.find((node) => node.id === target.id)
      if (!nodeAfter) {
        return false
      }
      return (
        Math.abs(nodeAfter.position.x - nodeBefore.position.x) >= 20 ||
        Math.abs(nodeAfter.position.y - nodeBefore.position.y) >= 20
      )
    })
    .toBe(true)
  const persistedAfterSave = await getWorkflowDetail(request, auth.session.token, workflow.item.id)
  const nodeAfterSave = persistedAfterSave.item.nodes.find((node) => node.id === target.id)
  if (!nodeAfterSave) throw new Error(`Workflow API did not return moved node ${target.id}.`)

  await page.reload()
  await page.locator('.react-flow').waitFor()
  await expect(page.locator('.react-flow__node').first()).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__minaWorkflowCanvasYjs?.matchesDocument?.())).toBe(true)
  const persistedAfterReload = await getWorkflowDetail(request, auth.session.token, workflow.item.id)
  const nodeAfterReload = persistedAfterReload.item.nodes.find((node) => node.id === target.id)
  if (!nodeAfterReload) throw new Error(`Workflow API did not return reloaded node ${target.id}.`)
  expect(nodeAfterReload.position).toEqual(nodeAfterSave.position)
})

test('workflow canvas opens the config card when a node is clicked', async ({ page, request }) => {
  const auth = await register(request)
  const workflow = await createWorkflow(request, auth.session.token, 20)
  await installAuthSession(page, auth)

  await page.goto(`/canvas/${workflow.item.id}`)
  await page.locator('.react-flow').waitFor()
  await expect(page.locator('.react-flow__node').first()).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__minaWorkflowCanvasYjs?.matchesDocument?.())).toBe(true)

  const target = await firstVisibleDraggableNode(page)
  await page.mouse.click(target.x, target.y)

  await expect(page.locator('.mina-wc-config-card')).toBeVisible()
})

test('workflow canvas keeps the config card open after config document updates', async ({ page, request }) => {
  const auth = await register(request)
  const workflow = await createWorkflow(request, auth.session.token, 20)
  await installAuthSession(page, auth)

  await page.goto(`/canvas/${workflow.item.id}`)
  await page.locator('.react-flow').waitFor()
  await expect(page.locator('.react-flow__node').first()).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__minaWorkflowCanvasYjs?.matchesDocument?.())).toBe(true)

  const target = await firstVisibleDraggableNode(page)
  await page.mouse.click(target.x, target.y)
  const configCard = page.locator('.mina-wc-config-card')
  await expect(configCard).toBeVisible()

  const prompt = configCard.getByRole('textbox', { name: 'Prompt' })
  await prompt.fill('Updated prompt while the panel stays open')

  await expect(configCard).toBeVisible()
  await expect(prompt).toHaveValue('Updated prompt while the panel stays open')
})

test('workflow canvas keeps dirty state after a save failure and recovers on retry', async ({ page, request }) => {
  const auth = await register(request)
  const workflow = await createWorkflow(request, auth.session.token, 20)
  await installAuthSession(page, auth)

  await page.goto(`/canvas/${workflow.item.id}`)
  await page.locator('.react-flow').waitFor()
  await expect(page.locator('.react-flow__node').first()).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__minaWorkflowCanvasYjs?.matchesDocument?.())).toBe(true)

  const target = await firstVisibleDraggableNode(page)
  let failSaves = true
  await page.route(`**/api/workflows/${workflow.item.id}`, async (route) => {
    if (route.request().method() === 'PUT' && failSaves) {
      await route.fulfill({
        contentType: 'application/json',
        status: 503,
        body: JSON.stringify({ error: { code: 'TEST_SAVE_FAILURE', message: 'Injected save failure.' } }),
      })
      return
    }
    await route.fallback()
  })

  const before = await readPerf(page)
  await page.mouse.move(target.x, target.y)
  await page.mouse.down()
  await page.mouse.move(target.x + 130, target.y + 70, { steps: 16 })
  await page.mouse.up()
  await expect
    .poll(async () => (await readPerf(page)).documentCommits - before.documentCommits)
    .toBe(1)
  await expect
    .poll(async () => (await readPerf(page)).autosaveStarts - before.autosaveStarts)
    .toBeGreaterThanOrEqual(1)
  await expect(page.getByText('Unsaved')).toBeVisible()

  failSaves = false
  await page.getByRole('button', { name: /save/i }).click()
  await expect(page.getByText('Saved')).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__minaWorkflowCanvasYjs?.matchesDocument?.())).toBe(true)
})

test('workflow canvas selection drag commits one document transaction for multiple nodes', async ({ page, request }) => {
  const auth = await register(request)
  const workflow = await createWorkflow(request, auth.session.token, 20)
  await installAuthSession(page, auth)

  await page.goto(`/canvas/${workflow.item.id}`)
  await page.locator('.react-flow').waitFor()
  await expect(page.locator('.react-flow__node').first()).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__minaWorkflowCanvasYjs?.matchesDocument?.())).toBe(true)

  const [first, second] = await visibleDraggableNodes(page, 2)
  if (!first || !second) {
    throw new Error('Expected two visible nodes for selection drag.')
  }
  const beforeDocument = await getWorkflowDetail(request, auth.session.token, workflow.item.id)
  const firstBefore = beforeDocument.item.nodes.find((node) => node.id === first.id)
  const secondBefore = beforeDocument.item.nodes.find((node) => node.id === second.id)
  if (!firstBefore || !secondBefore) {
    throw new Error('Workflow API did not return selected nodes before drag.')
  }

  await page.keyboard.down(process.platform === 'darwin' ? 'Meta' : 'Control')
  await page.mouse.click(first.x, first.y)
  await page.mouse.click(second.x, second.y)
  await page.keyboard.up(process.platform === 'darwin' ? 'Meta' : 'Control')

  const before = await readPerf(page)
  await page.mouse.move(first.x, first.y)
  await page.mouse.down()
  await page.mouse.move(first.x + 120, first.y + 60, { steps: 16 })
  const duringDrag = await readPerf(page)
  expect(duringDrag.autosaveStarts).toBe(before.autosaveStarts)
  await page.mouse.up()

  await expect
    .poll(async () => (await readPerf(page)).documentCommits - before.documentCommits)
    .toBe(1)
  await expect
    .poll(async () => {
      const afterDocument = await getWorkflowDetail(request, auth.session.token, workflow.item.id)
      const firstAfter = afterDocument.item.nodes.find((node) => node.id === first.id)
      const secondAfter = afterDocument.item.nodes.find((node) => node.id === second.id)
      if (!firstAfter || !secondAfter) {
        return false
      }
      return (
        firstAfter.position.x !== firstBefore.position.x &&
        secondAfter.position.x !== secondBefore.position.x
      )
    })
    .toBe(true)
})

test('workflow canvas 500-node fixture renders with visible-element clipping and bounded counters', async ({ page, request }) => {
  const auth = await register(request)
  const workflow = await createWorkflow(request, auth.session.token, 500)
  await installAuthSession(page, auth)

  await page.goto(`/canvas/${workflow.item.id}`)
  await page.locator('.react-flow').waitFor()
  await expect(page.locator('.react-flow__node').first()).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__minaWorkflowCanvasYjs?.matchesDocument?.())).toBe(true)

  const before = await readPerf(page)
  const flow = page.locator('.react-flow')
  const box = await flow.boundingBox()
  if (!box) throw new Error('React Flow viewport did not render a bounding box.')

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -900)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 - 220, box.y + box.height / 2 - 120, { steps: 15 })
  await page.mouse.up()

  const after = await readPerf(page)
  expect(after.nodesChangeEvents).toBe(before.nodesChangeEvents)
  expect(after.documentCommits).toBe(before.documentCommits)
  expect(after.autosaveStarts).toBe(before.autosaveStarts)
  expect(after.renderStateWrites).toBeGreaterThanOrEqual(before.renderStateWrites)

  const dragBefore = await readPerf(page)
  const dragTarget = await firstVisibleDraggableNode(page)
  const unrelatedDragTarget = await firstVisibleDraggableNodeExcept(page, dragTarget.id)
  const unrelatedRenderCountBefore = await readRenderCount(page, unrelatedDragTarget.id)
  await page.mouse.move(dragTarget.x, dragTarget.y)
  await page.mouse.down()
  await page.mouse.move(dragTarget.x + 140, dragTarget.y + 70, { steps: 18 })

  const duringLargeDrag = await readPerf(page)
  expect(duringLargeDrag.autosaveStarts).toBe(dragBefore.autosaveStarts)
  expect(await readRenderCount(page, unrelatedDragTarget.id)).toBe(unrelatedRenderCountBefore)

  await page.mouse.up()
  await expect
    .poll(async () => (await readPerf(page)).documentCommits - dragBefore.documentCommits)
    .toBe(1)
})
