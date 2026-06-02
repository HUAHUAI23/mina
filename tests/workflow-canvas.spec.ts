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
      data: {
        mediaSlots?: Record<string, Array<{
          id: string
          order: number
          required: boolean
          slot: string
          source: unknown
        }>>
        nodeType: string
        title: string
      }
      id: string
      position: {
        x: number
        y: number
      }
    }>
    version: number
  }
}

interface NodeScreenFrame {
  x: number
  y: number
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
      stateVector(): Uint8Array
    }
    __minaWorkflowCanvasUi?: {
      activeNodePanel: { nodeId: string; panel: string } | undefined
      selectedNodeIds: string[]
    }
  }
}

interface VisibleNodeTarget {
  id: string
  x: number
  y: number
}

const apiBaseUrl = process.env.MINA_E2E_API_BASE_URL ?? 'http://127.0.0.1:3001'
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

const videoNodeWithMixedSlots = (id: string, index: number) => ({
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
    mediaSlots: {
      firstFrame: [
        {
          id: `slot_${id}_first`,
          order: 0,
          required: true,
          slot: 'firstFrame',
          source: { type: 'external_url', kind: 'image', url: 'data:image/png;base64,aW1hZ2U=' },
        },
        {
          id: `slot_${id}_first_2`,
          order: 1,
          required: true,
          slot: 'firstFrame',
          source: { type: 'external_url', kind: 'image', url: 'data:image/png;base64,aW1hZ2Uy' },
        },
      ],
      referenceVideos: [
        {
          id: `slot_${id}_reference_video`,
          order: 0,
          required: true,
          slot: 'referenceVideos',
          source: { type: 'external_url', kind: 'video', url: 'https://cdn.test/ref.mp4' },
        },
      ],
    },
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

const readNodeScreenFrame = async (page: Page, nodeId: string): Promise<NodeScreenFrame> =>
  page.locator(`.react-flow__node[data-id="${nodeId}"]`).evaluate((node) => {
    const rect = node.getBoundingClientRect()
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    }
  })

const readSelectedNodeIds = async (page: Page): Promise<string[]> =>
  page.evaluate(() => window.__minaWorkflowCanvasUi?.selectedNodeIds ?? [])

const waitForYjsParity = async (page: Page): Promise<void> => {
  await expect
    .poll(() =>
      page.evaluate(() => (window.__minaWorkflowCanvasYjs?.stateVector?.().byteLength ?? 0) > 0),
    )
    .toBe(true)
  await expect.poll(() => page.evaluate(() => window.__minaWorkflowCanvasYjs?.matchesDocument?.())).toBe(true)
}

const dragNodeBy = async (
  page: Page,
  nodeId: string,
  delta: { x: number; y: number },
  steps = 18,
): Promise<NodeScreenFrame> => {
  const before = await readNodeScreenFrame(page, nodeId)
  await page.mouse.move(before.x, before.y)
  await page.mouse.down()
  await page.mouse.move(before.x + delta.x, before.y + delta.y, { steps })
  await page.mouse.up()
  return readNodeScreenFrame(page, nodeId)
}

const readNodeHeaderFrame = async (page: Page, nodeId: string): Promise<NodeScreenFrame> =>
  page.locator(`.react-flow__node[data-id="${nodeId}"] .mina-wc-node-header`).evaluate((node) => {
    const rect = node.getBoundingClientRect()
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    }
  })

const selectNodes = async (page: Page, nodeIds: readonly string[]): Promise<void> => {
  for (const nodeId of nodeIds) {
    if ((await readSelectedNodeIds(page)).includes(nodeId)) {
      continue
    }
    const frame = await readNodeHeaderFrame(page, nodeId)
    const hasSelection = (await readSelectedNodeIds(page)).length > 0
    if (hasSelection) {
      await page.keyboard.down('Control')
      await page.mouse.click(frame.x, frame.y)
      await page.keyboard.up('Control')
      continue
    }
    await page.mouse.click(frame.x, frame.y)
  }

  await expect
    .poll(async () => {
      const selected = await readSelectedNodeIds(page)
      return nodeIds.every((nodeId) => selected.includes(nodeId))
    })
    .toBe(true)
}

test('workflow canvas drag/sync/reload keeps document commits bounded and Yjs parity intact', async ({ page, request }) => {
  const auth = await register(request)
  const workflow = await createWorkflow(request, auth.session.token, 20)
  await installAuthSession(page, auth)

  await page.goto(`/canvas/${workflow.item.id}`)
  await waitForYjsParity(page)
  await page.locator('.react-flow').waitFor()
  await expect(page.locator('.react-flow__node').first()).toBeVisible()

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
  expect((await readPerf(page)).autosaveStarts).toBe(before.autosaveStarts)
  await waitForYjsParity(page)
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
  const persistedAfterSync = await getWorkflowDetail(request, auth.session.token, workflow.item.id)
  const nodeAfterSync = persistedAfterSync.item.nodes.find((node) => node.id === target.id)
  if (!nodeAfterSync) throw new Error(`Workflow API did not return moved node ${target.id}.`)

  await page.reload()
  await page.locator('.react-flow').waitFor()
  await expect(page.locator('.react-flow__node').first()).toBeVisible()
  await waitForYjsParity(page)
  const persistedAfterReload = await getWorkflowDetail(request, auth.session.token, workflow.item.id)
  const nodeAfterReload = persistedAfterReload.item.nodes.find((node) => node.id === target.id)
  if (!nodeAfterReload) throw new Error(`Workflow API did not return reloaded node ${target.id}.`)
  expect(nodeAfterReload.position).toEqual(nodeAfterSync.position)
})

test('workflow canvas does not render the manual add toolbar', async ({ page, request }) => {
  const auth = await register(request)
  const workflow = await createWorkflow(request, auth.session.token, 20)
  await installAuthSession(page, auth)

  await page.goto(`/canvas/${workflow.item.id}`)
  await page.locator('.react-flow').waitFor()
  await expect(page.locator('.react-flow__node')).toHaveCount(20)
  await waitForYjsParity(page)

  await expect(page.locator('[aria-label="Canvas tools"]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Add (Image|Video|Text|Flow|Group)$/ })).toHaveCount(0)
})

test('workflow canvas opens the config card when a node is clicked', async ({ page, request }) => {
  const auth = await register(request)
  const workflow = await createWorkflow(request, auth.session.token, 20)
  await installAuthSession(page, auth)

  await page.goto(`/canvas/${workflow.item.id}`)
  await page.locator('.react-flow').waitFor()
  await expect(page.locator('.react-flow__node').first()).toBeVisible()
  await waitForYjsParity(page)

  const target = await firstVisibleDraggableNode(page)
  await page.mouse.click(target.x, target.y)

  await expect(page.locator('.mina-wc-config-card')).toBeVisible()
})

test('workflow canvas undo and redo controls restore graph edits without intercepting text editing', async ({ page, request }) => {
  const auth = await register(request)
  const workflow = await createWorkflow(request, auth.session.token, 20)
  await installAuthSession(page, auth)

  await page.goto(`/canvas/${workflow.item.id}`)
  await page.locator('.react-flow').waitFor()
  await expect(page.locator('.react-flow__node').first()).toBeVisible()
  await waitForYjsParity(page)

  const undoButton = page.getByRole('button', { name: 'Undo' })
  const redoButton = page.getByRole('button', { name: 'Redo' })
  await expect(undoButton).toBeDisabled()
  await expect(redoButton).toBeDisabled()

  const target = await firstVisibleDraggableNode(page)
  const before = await readNodeScreenFrame(page, target.id)
  await dragNodeBy(page, target.id, { x: 80, y: 36 })
  await waitForYjsParity(page)
  await expect(undoButton).toBeEnabled()

  await undoButton.click()
  await waitForYjsParity(page)
  await expect.poll(async () => {
    const frame = await readNodeScreenFrame(page, target.id)
    return Math.abs(frame.x - before.x) < 2 && Math.abs(frame.y - before.y) < 2
  }).toBe(true)
  await expect(redoButton).toBeEnabled()

  await redoButton.click()
  await waitForYjsParity(page)
  const afterRedo = await readNodeScreenFrame(page, target.id)
  expect(Math.abs(afterRedo.x - before.x)).toBeGreaterThan(20)

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z')
  await waitForYjsParity(page)
  await expect.poll(async () => {
    const frame = await readNodeScreenFrame(page, target.id)
    return Math.abs(frame.x - before.x) < 2 && Math.abs(frame.y - before.y) < 2
  }).toBe(true)

  const textTarget = await firstVisibleDraggableNodeExcept(page, target.id)
  await page.mouse.click(textTarget.x, textTarget.y)
  const promptField = page.locator('.mina-wc-config-card textarea').first()
  await expect(promptField).toBeVisible()
  await promptField.fill('Native text undo sentinel')
  await promptField.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z')
  await expect(promptField).not.toHaveValue('Native text undo sentinel')
  await expect(redoButton).toBeEnabled()
})

test('workflow canvas dock shows empty prompt and expands into media composer', async ({ page, request }) => {
  const auth = await register(request)
  const workflow = await createWorkflow(request, auth.session.token, 20)
  await installAuthSession(page, auth)

  await page.goto(`/canvas/${workflow.item.id}`)
  await page.locator('.react-flow').waitFor()
  await expect(page.locator('.react-flow__node').first()).toBeVisible()

  const dock = page.locator('.mina-wc-canvas-dock')
  const shell = page.locator('.mina-wc-dock-shell')
  const emptyComposer = page.locator('.mina-wc-empty-composer')
  await expect(dock).toBeVisible()
  await expect(shell).toHaveAttribute('data-context', 'empty')
  await expect(emptyComposer).toBeVisible()
  await expect(emptyComposer.getByRole('textbox', { name: 'Prompt' })).toBeVisible()
  await expect(emptyComposer.getByRole('button', { name: 'Insert node' })).toBeVisible()
  const emptyDockFrame = await dock.boundingBox()
  expect(emptyDockFrame).not.toBeNull()
  expect(emptyDockFrame?.y ?? 0).toBeGreaterThan(360)

  const runNodeIds: string[] = []
  page.on('request', (request) => {
    if (request.method() !== 'POST' || !request.url().endsWith(`/api/workflows/${workflow.item.id}/runs`)) {
      return
    }
    const body = request.postDataJSON() as { selectedNodeId?: string }
    if (body.selectedNodeId) {
      runNodeIds.push(body.selectedNodeId)
    }
  })
  await emptyComposer.getByRole('textbox', { name: 'Prompt' }).fill('A glass greenhouse at sunset')
  await shell.getByRole('button', { name: 'Insert node' }).click()
  await expect(page.locator('.react-flow__node')).toHaveCount(21)
  await expect.poll(() => readSelectedNodeIds(page)).toHaveLength(1)
  await page.waitForTimeout(250)
  await expect.poll(() => runNodeIds.length).toBe(0)
  const [insertedNodeId] = await readSelectedNodeIds(page)
  expect(insertedNodeId).toBeTruthy()
  await expect(shell).toHaveAttribute('data-context', 'node')
  await expect(page.locator(`.react-flow__node[data-id="${insertedNodeId}"]`)).toBeVisible()
  await expect(page.locator('.mina-wc-config-toolbar')).toBeVisible()
  await shell.getByRole('button', { name: 'Run' }).click()
  await expect.poll(() => runNodeIds.join(',')).toBe(insertedNodeId)

  await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } })
  await expect(shell).toHaveAttribute('data-context', 'empty')
  await expect(emptyComposer.getByRole('textbox', { name: 'Prompt' })).toBeVisible()

  const target = await firstVisibleDraggableNode(page)
  await page.mouse.click(target.x, target.y)

  await expect(shell).toHaveAttribute('data-context', 'node')
  await expect(page.locator('.mina-wc-slot-list')).toBeVisible()
  await expect(page.locator('.mina-wc-stack-add').first()).toBeVisible()
  await expect(page.locator('.mina-wc-slot-section')).toHaveCount(1)
  await expect(page.locator('.mina-wc-composer-card')).toBeVisible()
  await expect(page.locator('.mina-wc-attachment-layer')).toBeVisible()
  await expect(page.locator('.mina-wc-composer-prompt')).toBeVisible()
  await expect(page.locator('.mina-wc-config-toolbar')).toBeVisible()
  await expect(page.locator('.mina-wc-slot-thumb').first()).toHaveCSS('aspect-ratio', '3 / 4')
  const promptTextarea = page.locator('.mina-wc-composer-prompt textarea')
  const promptPadding = await promptTextarea.evaluate((element) => {
    const style = getComputedStyle(element)
    return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft]
  })
  expect(promptPadding).toEqual(['0px', '0px', '0px', '0px'])
  const attachmentFrame = await page.locator('.mina-wc-attachment-layer').boundingBox()
  const promptFrame = await promptTextarea.boundingBox()
  expect(attachmentFrame).not.toBeNull()
  expect(promptFrame).not.toBeNull()
  const mediaTextGap = (promptFrame?.x ?? 0) - ((attachmentFrame?.x ?? 0) + (attachmentFrame?.width ?? 0))
  expect(mediaTextGap).toBeGreaterThanOrEqual(10)
  expect(mediaTextGap).toBeLessThanOrEqual(28)
  const previousPromptValue = await promptTextarea.inputValue()
  await promptTextarea.fill(Array.from({ length: 18 }, (_unused, index) => `Line ${index + 1}`).join('\n'))
  const longPromptMetrics = await promptTextarea.evaluate((element) => ({
    clientHeight: element.clientHeight,
    maxHeight: Number.parseFloat(getComputedStyle(element).maxHeight),
    scrollHeight: element.scrollHeight,
  }))
  expect(longPromptMetrics.clientHeight).toBeLessThanOrEqual(longPromptMetrics.maxHeight + 1)
  expect(longPromptMetrics.scrollHeight).toBeGreaterThan(longPromptMetrics.clientHeight)
  await promptTextarea.fill(previousPromptValue)
  const expandedDockFrame = await dock.boundingBox()
  expect(expandedDockFrame).not.toBeNull()
  expect(expandedDockFrame?.y ?? 0).toBeGreaterThan(250)
})

test('workflow canvas video media dock uses one active stack with slot tabs', async ({ page, request }) => {
  const auth = await register(request)
  const response = await request.post(`${apiBaseUrl}/api/workflows`, {
    data: {
      name: 'Video media dock',
      nodes: [videoNodeWithMixedSlots('video_media', 0)],
      edges: [],
    },
    headers: { Authorization: `Bearer ${auth.session.token}` },
  })
  expect(response.ok()).toBe(true)
  const workflow = (await response.json()) as WorkflowCreateResponse
  await installAuthSession(page, auth)

  await page.goto(`/canvas/${workflow.item.id}`)
  await page.locator('.react-flow').waitFor()
  await waitForYjsParity(page)

  const target = await firstVisibleDraggableNode(page)
  await page.mouse.click(target.x, target.y)

  const stackFrame = await page.locator('.mina-wc-slot-section').boundingBox()
  expect(stackFrame).not.toBeNull()
  await page.mouse.move((stackFrame?.x ?? 0) + 24, (stackFrame?.y ?? 0) + 24)
  await expect(page.locator('.mina-wc-slot-section')).toHaveAttribute('data-expanded', 'true')
  await expect(page.locator('.mina-wc-slot-tabs')).toBeVisible()
  await expect(page.locator('.mina-wc-slot-tab')).toHaveCount(4)
  await expect(page.locator('.mina-wc-slot-section')).toHaveCount(1)
  await expect(page.locator('.mina-wc-slot-thumb')).toHaveCount(2)
  await page.getByRole('tab', { name: /Reference video/ }).click()
  await expect(page.locator('.mina-wc-slot-section')).toHaveCount(1)
  await expect(page.locator('.mina-wc-slot-thumb')).toHaveCount(1)
})

test('workflow canvas media stack expands on hover while composer is collapsed', async ({ page, request }) => {
  const auth = await register(request)
  const targetNode = imageNode('hover_stack', 0)
  const response = await request.post(`${apiBaseUrl}/api/workflows`, {
    data: {
      name: 'Hover media stack',
      nodes: [
        {
          ...targetNode,
          data: {
            ...targetNode.data,
            mediaSlots: {
              inputImages: [
                {
                  id: 'slot_hover_one',
                  order: 0,
                  required: true,
                  slot: 'inputImages',
                  source: { type: 'external_url', kind: 'image', url: 'data:image/png;base64,aW1hZ2Ux' },
                },
                {
                  id: 'slot_hover_two',
                  order: 1,
                  required: true,
                  slot: 'inputImages',
                  source: { type: 'external_url', kind: 'image', url: 'data:image/png;base64,aW1hZ2Uy' },
                },
                {
                  id: 'slot_hover_three',
                  order: 2,
                  required: true,
                  slot: 'inputImages',
                  source: { type: 'external_url', kind: 'image', url: 'data:image/png;base64,aW1hZ2Uz' },
                },
                {
                  id: 'slot_hover_four',
                  order: 3,
                  required: true,
                  slot: 'inputImages',
                  source: { type: 'external_url', kind: 'image', url: 'data:image/png;base64,aW1hZ2U0' },
                },
                {
                  id: 'slot_hover_five',
                  order: 4,
                  required: true,
                  slot: 'inputImages',
                  source: { type: 'external_url', kind: 'image', url: 'data:image/png;base64,aW1hZ2U1' },
                },
              ],
            },
          },
        },
      ],
      edges: [],
    },
    headers: { Authorization: `Bearer ${auth.session.token}` },
  })
  expect(response.ok()).toBe(true)
  const workflow = (await response.json()) as WorkflowCreateResponse
  await installAuthSession(page, auth)

  await page.goto(`/canvas/${workflow.item.id}`)
  await page.locator('.react-flow').waitFor()
  await waitForYjsParity(page)

  const target = await firstVisibleDraggableNode(page)
  await page.mouse.click(target.x, target.y)
  await expect(page.locator('.mina-wc-composer-card')).not.toHaveAttribute('data-expanded', 'true')
  await expect(page.locator('.mina-wc-slot-thumb')).toHaveCount(2)

  const stackFrame = await page.locator('.mina-wc-slot-section').boundingBox()
  expect(stackFrame).not.toBeNull()
  await page.mouse.move((stackFrame?.x ?? 0) + 24, (stackFrame?.y ?? 0) + 24)
  await expect(page.locator('.mina-wc-slot-section')).toHaveAttribute('data-expanded', 'true')
  await expect(page.locator('.mina-wc-slot-thumb')).toHaveCount(5)
})

test('workflow canvas attachment composer stays usable on mobile', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const auth = await register(request)
  const workflow = await createWorkflow(request, auth.session.token, 20)
  await installAuthSession(page, auth)

  await page.goto(`/canvas/${workflow.item.id}`)
  await page.locator('.react-flow').waitFor()
  await waitForYjsParity(page)

  const target = await firstVisibleDraggableNode(page)
  await page.mouse.click(target.x, target.y)

  await expect(page.locator('.mina-wc-composer-card')).toBeVisible()
  await expect(page.locator('.mina-wc-attachment-layer')).toBeVisible()
  await expect(page.locator('.mina-wc-config-toolbar')).toBeVisible()
  const dockFrame = await page.locator('.mina-wc-canvas-dock').boundingBox()
  const toolbarFrame = await page.locator('.mina-wc-config-toolbar').boundingBox()
  const attachmentFrame = await page.locator('.mina-wc-attachment-layer').boundingBox()
  expect(dockFrame).not.toBeNull()
  expect(toolbarFrame).not.toBeNull()
  expect(attachmentFrame).not.toBeNull()
  expect((dockFrame?.x ?? 0)).toBeGreaterThanOrEqual(0)
  expect((dockFrame?.x ?? 0) + (dockFrame?.width ?? 0)).toBeLessThanOrEqual(390)
  expect((attachmentFrame?.y ?? 0) + (attachmentFrame?.height ?? 0)).toBeLessThan(toolbarFrame?.y ?? 0)
})

test('workflow canvas reorders uploaded media slot items', async ({ page, request }) => {
  const auth = await register(request)
  const mediaOneResponse = await request.post(`${apiBaseUrl}/api/media-objects`, {
    headers: { Authorization: `Bearer ${auth.session.token}` },
    multipart: {
      file: {
        buffer: Buffer.from('image-one'),
        mimeType: 'image/png',
        name: 'one.png',
      },
      purpose: 'workflow_slot',
      retention: 'project_scoped',
    },
  })
  const mediaTwoResponse = await request.post(`${apiBaseUrl}/api/media-objects`, {
    headers: { Authorization: `Bearer ${auth.session.token}` },
    multipart: {
      file: {
        buffer: Buffer.from('image-two'),
        mimeType: 'image/png',
        name: 'two.png',
      },
      purpose: 'workflow_slot',
      retention: 'project_scoped',
    },
  })
  expect(mediaOneResponse.ok()).toBe(true)
  expect(mediaTwoResponse.ok()).toBe(true)
  const mediaOne = (await mediaOneResponse.json()) as { item: { id: string } }
  const mediaTwo = (await mediaTwoResponse.json()) as { item: { id: string } }
  const uploadedTargetNode = imageNode('uploaded_target', 0)
  const uploadWorkflowResponse = await request.post(`${apiBaseUrl}/api/workflows`, {
    data: {
      name: 'Uploaded reorder',
      nodes: [
        {
          ...uploadedTargetNode,
          data: {
            ...uploadedTargetNode.data,
            mediaSlots: {
              inputImages: [
                {
                  id: 'slot_upload_one',
                  order: 0,
                  required: true,
                  slot: 'inputImages',
                  source: { type: 'media_object', mediaObjectId: mediaOne.item.id },
                },
                {
                  id: 'slot_upload_two',
                  order: 1,
                  required: true,
                  slot: 'inputImages',
                  source: { type: 'media_object', mediaObjectId: mediaTwo.item.id },
                },
              ],
            },
          },
        },
      ],
      edges: [],
    },
    headers: { Authorization: `Bearer ${auth.session.token}` },
  })
  expect(uploadWorkflowResponse.ok()).toBe(true)
  const uploadWorkflow = (await uploadWorkflowResponse.json()) as WorkflowCreateResponse
  await installAuthSession(page, auth)

  await page.goto(`/canvas/${uploadWorkflow.item.id}`)
  await page.locator('.react-flow').waitFor()
  await waitForYjsParity(page)

  const target = await firstVisibleDraggableNode(page)
  await page.mouse.click(target.x, target.y)
  const stackFrame = await page.locator('.mina-wc-slot-section').boundingBox()
  expect(stackFrame).not.toBeNull()
  await page.mouse.move((stackFrame?.x ?? 0) + 24, (stackFrame?.y ?? 0) + 24)
  await expect(page.locator('.mina-wc-slot-section')).toHaveAttribute('data-expanded', 'true')
  const thumbs = page.locator('.mina-wc-slot-thumb')
  await expect(thumbs).toHaveCount(2)
  const firstBox = await thumbs.nth(0).boundingBox()
  const secondBox = await thumbs.nth(1).boundingBox()
  expect(firstBox).not.toBeNull()
  expect(secondBox).not.toBeNull()
  await page.mouse.move((firstBox?.x ?? 0) + (firstBox?.width ?? 0) / 2, (firstBox?.y ?? 0) + (firstBox?.height ?? 0) / 2)
  await page.mouse.down()
  const dockFrameDuringDrag = await page.locator('.mina-wc-canvas-dock').boundingBox()
  expect(dockFrameDuringDrag).not.toBeNull()
  await page.mouse.move((firstBox?.x ?? 0) + (firstBox?.width ?? 0) / 2 + 12, (dockFrameDuringDrag?.y ?? 0) - 72, { steps: 8 })
  const floatingBox = await page.locator('.mina-wc-slot-drag-overlay .mina-wc-slot-thumb').boundingBox()
  expect(floatingBox).not.toBeNull()
  expect(floatingBox?.y ?? 0).toBeLessThan(dockFrameDuringDrag?.y ?? 0)
  await page.mouse.move((secondBox?.x ?? 0) + (secondBox?.width ?? 0) + 20, (secondBox?.y ?? 0) + (secondBox?.height ?? 0) / 2, { steps: 12 })
  await page.mouse.up()
  const afterDrag = await getWorkflowDetail(request, auth.session.token, uploadWorkflow.item.id)
  if (afterDrag.item.nodes[0]?.data.mediaSlots?.inputImages?.[0]?.id !== 'slot_upload_two') {
    await page.locator('.mina-wc-slot-reorder-item').first().focus()
    await page.keyboard.press('ArrowRight')
  }
  await waitForYjsParity(page)

  await expect
    .poll(async () => {
      const persisted = await getWorkflowDetail(request, auth.session.token, uploadWorkflow.item.id)
      const [node] = persisted.item.nodes
      return node?.data.mediaSlots?.inputImages?.map((item) => item.id).join(',')
    })
    .toBe('slot_upload_two,slot_upload_one')
})

test('workflow canvas keeps the config card open after config document updates', async ({ page, request }) => {
  const auth = await register(request)
  const workflow = await createWorkflow(request, auth.session.token, 20)
  await installAuthSession(page, auth)

  await page.goto(`/canvas/${workflow.item.id}`)
  await page.locator('.react-flow').waitFor()
  await expect(page.locator('.react-flow__node').first()).toBeVisible()
  await waitForYjsParity(page)

  const target = await firstVisibleDraggableNode(page)
  await page.mouse.click(target.x, target.y)
  const configCard = page.locator('.mina-wc-config-card')
  await expect(configCard).toBeVisible()

  const prompt = configCard.getByRole('textbox', { name: 'Prompt' })
  await prompt.fill('Updated prompt while the panel stays open')

  await expect(configCard).toBeVisible()
  await expect(prompt).toHaveValue('Updated prompt while the panel stays open')
})

test('workflow canvas collaboration keeps remote moves, nodes, and config interaction stable', async ({ page, context, request }) => {
  const auth = await register(request)
  const workflow = await createWorkflow(request, auth.session.token, 20)
  await installAuthSession(page, auth)
  const collaborator = await context.newPage()
  await installAuthSession(collaborator, auth)

  await page.goto(`/canvas/${workflow.item.id}`)
  await collaborator.goto(`/canvas/${workflow.item.id}`)
  for (const canvasPage of [page, collaborator]) {
    await canvasPage.locator('.react-flow').waitFor()
    await expect(canvasPage.locator('.react-flow__node').first()).toBeVisible()
    await waitForYjsParity(canvasPage)
  }

  const target = await firstVisibleDraggableNode(page)
  await page.mouse.click(target.x, target.y)
  const configCard = page.locator('.mina-wc-config-card')
  await expect(configCard).toBeVisible()

  const collaboratorTargetBefore = await readNodeScreenFrame(collaborator, target.id)
  await collaborator.mouse.move(collaboratorTargetBefore.x, collaboratorTargetBefore.y)
  await collaborator.mouse.down()
  await collaborator.mouse.move(collaboratorTargetBefore.x + 150, collaboratorTargetBefore.y + 80, { steps: 18 })
  await collaborator.mouse.up()

  await expect
    .poll(async () => {
      const after = await readNodeScreenFrame(page, target.id)
      return Math.abs(after.x - target.x) >= 20 || Math.abs(after.y - target.y) >= 20
    })
    .toBe(true)
  await expect(page.locator('.react-flow__node')).toHaveCount(20)
  await expect(configCard).toBeVisible()

  const prompt = configCard.getByRole('textbox', { name: 'Prompt' })
  await prompt.fill('Collaborative prompt while remote move is retained')
  await expect(configCard).toBeVisible()

  await waitForYjsParity(page)

  const initialNode = createWorkflowFixture(20).nodes.find((node) => node.id === target.id)
  if (!initialNode) {
    throw new Error(`Workflow fixture did not contain node ${target.id}.`)
  }
  await expect
    .poll(async () => {
      const persisted = await getWorkflowDetail(request, auth.session.token, workflow.item.id)
      const movedNode = persisted.item.nodes.find((node) => node.id === target.id)
      return Boolean(
        persisted.item.nodes.length === 20 &&
          movedNode &&
          (
            Math.abs(movedNode.position.x - initialNode.position.x) >= 20 ||
            Math.abs(movedNode.position.y - initialNode.position.y) >= 20
          ),
      )
    })
    .toBe(true)
})

test('workflow canvas collaboration lets a synced peer immediately move the same node', async ({ page, context, request }) => {
  const auth = await register(request)
  const workflow = await createWorkflow(request, auth.session.token, 20)
  await installAuthSession(page, auth)
  const collaborator = await context.newPage()
  await installAuthSession(collaborator, auth)

  await page.goto(`/canvas/${workflow.item.id}`)
  await collaborator.goto(`/canvas/${workflow.item.id}`)
  for (const canvasPage of [page, collaborator]) {
    await canvasPage.locator('.react-flow').waitFor()
    await expect(canvasPage.locator('.react-flow__node').first()).toBeVisible()
    await waitForYjsParity(canvasPage)
  }

  const target = await firstVisibleDraggableNode(page)
  await page.mouse.click(target.x, target.y)
  await expect(page.locator('.mina-wc-config-card')).toBeVisible()

  const pageMove = await dragNodeBy(page, target.id, { x: 150, y: 70 })
  await expect
    .poll(async () => {
      const synced = await readNodeScreenFrame(collaborator, target.id)
      return Math.abs(synced.x - pageMove.x) <= 12 && Math.abs(synced.y - pageMove.y) <= 12
    })
    .toBe(true)

  const collaboratorMove = await dragNodeBy(collaborator, target.id, { x: -110, y: 95 })
  await expect
    .poll(async () => {
      const current = await readNodeScreenFrame(collaborator, target.id)
      return Math.abs(current.x - collaboratorMove.x) <= 12 && Math.abs(current.y - collaboratorMove.y) <= 12
    })
    .toBe(true)
  await expect
    .poll(async () => {
      const synced = await readNodeScreenFrame(page, target.id)
      return Math.abs(synced.x - collaboratorMove.x) <= 12 && Math.abs(synced.y - collaboratorMove.y) <= 12
    })
    .toBe(true)

  await expect(page.locator('.mina-wc-config-card')).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => window.__minaWorkflowCanvasUi?.activeNodePanel?.nodeId))
    .toBe(target.id)

  await waitForYjsParity(page)
  await waitForYjsParity(collaborator)

  const initialNode = createWorkflowFixture(20).nodes.find((node) => node.id === target.id)
  if (!initialNode) {
    throw new Error(`Workflow fixture did not contain node ${target.id}.`)
  }
  await expect
    .poll(async () => {
      const persisted = await getWorkflowDetail(request, auth.session.token, workflow.item.id)
      const movedNode = persisted.item.nodes.find((node) => node.id === target.id)
      return Boolean(
        movedNode &&
          movedNode.position.x !== initialNode.position.x &&
          movedNode.position.y !== initialNode.position.y,
      )
    })
    .toBe(true)
})

test('workflow canvas persists graph changes without checkpoint save requests', async ({ page, request }) => {
  const auth = await register(request)
  const workflow = await createWorkflow(request, auth.session.token, 20)
  await installAuthSession(page, auth)

  await page.goto(`/canvas/${workflow.item.id}`)
  await page.locator('.react-flow').waitFor()
  await expect(page.locator('.react-flow__node').first()).toBeVisible()
  await waitForYjsParity(page)

  const target = await firstVisibleDraggableNode(page)
  const persistedBefore = await getWorkflowDetail(request, auth.session.token, workflow.item.id)
  const nodeBefore = persistedBefore.item.nodes.find((node) => node.id === target.id)
  if (!nodeBefore) throw new Error(`Workflow API did not return node ${target.id}.`)
  let checkpointRequests = 0
  await page.route(`**/api/workflows/${workflow.item.id}/collab/checkpoint`, async (route) => {
    if (route.request().method() === 'POST') {
      checkpointRequests += 1
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
    .toBe(0)
  await waitForYjsParity(page)
  expect(checkpointRequests).toBe(0)
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
})

test('workflow canvas selection drag commits one Yjs graph update for multiple nodes', async ({ page, request }) => {
  const auth = await register(request)
  const workflow = await createWorkflow(request, auth.session.token, 20)
  await installAuthSession(page, auth)

  await page.goto(`/canvas/${workflow.item.id}`)
  await page.locator('.react-flow').waitFor()
  await expect(page.locator('.react-flow__node').first()).toBeVisible()
  await waitForYjsParity(page)

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

  await selectNodes(page, [first.id, second.id])

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
  await waitForYjsParity(page)
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
  await waitForYjsParity(page)

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
  expect(after.nodesChangeEvents - before.nodesChangeEvents).toBeLessThanOrEqual(1)
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
