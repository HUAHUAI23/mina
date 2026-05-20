import { chromium, request as playwrightRequest } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

interface AuthResponse {
  session: {
    token: string
  }
}

interface WorkflowCreateResponse {
  item: {
    id: string
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

interface VisibleNodeTarget {
  id: string
  x: number
  y: number
}

interface ScenarioSummary {
  nodeCount: number
  phases: {
    dragMove: PhaseSummary
    dragStopAndSave: PhaseSummary
    panZoom: PhaseSummary
  }
  traceFile: string
  traceSizeBytes: number
  yjsMatchesDocument: boolean
}

interface PhaseSummary {
  counters: {
    autosaveStarts: number
    documentCommits: number
    nodesChangeEvents: number
    renderStateWrites: number
    websocketReconnects: number
    yjsUpdatesReceived: number
    yjsUpdatesSent: number
  }
  maxProfilerActualDurationMs: number
  profilerCommitCount: number
  unrelatedNodeRenderDelta?: number | undefined
}

const apiBaseUrl = 'http://127.0.0.1:3001'
const webBaseUrl = 'http://127.0.0.1:3000'
const authStorageKey = 'mina.auth.session'
const outputDir = join(
  process.cwd(),
  'helloagents/history/2026-05/202605200314_workflow_canvas_performance_collab/artifacts/performance',
)

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
      email: `workflow-canvas-perf-${suffix}@example.com`,
      password: 'correct horse battery staple',
      username: `canvas_perf_${suffix}`,
    },
  })
  if (!response.ok()) {
    throw new Error(`Failed to register performance user: ${response.status()}`)
  }
  return response.json() as Promise<AuthResponse>
}

const createWorkflow = async (
  request: APIRequestContext,
  token: string,
  nodeCount: number,
): Promise<WorkflowCreateResponse> => {
  const response = await request.post(`${apiBaseUrl}/api/workflows`, {
    data: {
      name: `Canvas Trace ${nodeCount}`,
      ...createWorkflowFixture(nodeCount),
    },
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok()) {
    throw new Error(`Failed to create workflow fixture: ${response.status()}`)
  }
  return response.json() as Promise<WorkflowCreateResponse>
}

const installAuthSession = async (page: Page, auth: AuthResponse) => {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, JSON.stringify(value)),
    [authStorageKey, auth],
  )
}

const readPerf = async (page: Page): Promise<CanvasPerfCounters> =>
  page.evaluate(() => ({ ...window.__minaWorkflowCanvasPerf }) as CanvasPerfCounters)

const readProfilerCommits = async (page: Page): Promise<CanvasProfilerCommit[]> =>
  page.evaluate(() => window.__minaWorkflowCanvasProfiler?.map((commit) => ({ ...commit })) ?? [])

const readRenderCount = async (page: Page, nodeId: string): Promise<number> =>
  page.evaluate((id) => window.__minaWorkflowCanvasRenderCounts?.[id] ?? 0, nodeId)

const firstVisibleDraggableNode = async (page: Page, excludedNodeId?: string): Promise<VisibleNodeTarget> =>
  page.locator('.react-flow__node.draggable').evaluateAll((nodes, excluded) => {
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    for (const node of nodes) {
      const id = node.getAttribute('data-id')
      if (!id || id === excluded) {
        continue
      }
      const rect = node.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const y = rect.top + rect.height / 2
      if (rect.width > 0 && rect.height > 0 && x >= 0 && x <= viewportWidth && y >= 0 && y <= viewportHeight) {
        return { id, x, y }
      }
    }
    throw new Error('No visible draggable React Flow node found.')
  }, excludedNodeId)

const counterDelta = (after: CanvasPerfCounters, before: CanvasPerfCounters): ScenarioSummary['counters'] => ({
  autosaveStarts: after.autosaveStarts - before.autosaveStarts,
  documentCommits: after.documentCommits - before.documentCommits,
  nodesChangeEvents: after.nodesChangeEvents - before.nodesChangeEvents,
  renderStateWrites: after.renderStateWrites - before.renderStateWrites,
  websocketReconnects: after.websocketReconnects - before.websocketReconnects,
  yjsUpdatesReceived: after.yjsUpdatesReceived - before.yjsUpdatesReceived,
  yjsUpdatesSent: after.yjsUpdatesSent - before.yjsUpdatesSent,
})

const phaseSummary = (
  after: CanvasPerfCounters,
  before: CanvasPerfCounters,
  profilerCommits: readonly CanvasProfilerCommit[],
  unrelatedNodeRenderDelta?: number,
): PhaseSummary => ({
  counters: counterDelta(after, before),
  maxProfilerActualDurationMs: Math.max(0, ...profilerCommits.map((commit) => commit.actualDuration)),
  profilerCommitCount: profilerCommits.length,
  ...(unrelatedNodeRenderDelta === undefined ? {} : { unrelatedNodeRenderDelta }),
})

const collectTrace = async <T>(page: Page, tracePath: string, action: () => Promise<T>): Promise<T> => {
  const client = await page.context().newCDPSession(page)
  await client.send('Tracing.start', {
    categories: [
      'devtools.timeline',
      'disabled-by-default-devtools.timeline',
      'blink.user_timing',
      'loading',
      'v8.execute',
    ].join(','),
    transferMode: 'ReturnAsStream',
  })
  const tracingComplete = new Promise<string>((resolve, reject) => {
    client.once('Tracing.tracingComplete', async ({ stream }: { stream?: string }) => {
      try {
        if (!stream) {
          resolve('')
          return
        }
        let data = ''
        let eof = false
        while (!eof) {
          const chunk = await client.send('IO.read', { handle: stream })
          data += chunk.data ?? ''
          eof = Boolean(chunk.eof)
        }
        await client.send('IO.close', { handle: stream })
        resolve(data)
      } catch (error) {
        reject(error)
      }
    })
  })
  try {
    const result = await action()
    await client.send('Tracing.end')
    await writeFile(tracePath, await tracingComplete, 'utf8')
    return result
  } finally {
    await client.detach().catch(() => undefined)
  }
}

const runScenario = async (
  request: APIRequestContext,
  page: Page,
  auth: AuthResponse,
  nodeCount: number,
): Promise<ScenarioSummary> => {
  const workflow = await createWorkflow(request, auth.session.token, nodeCount)
  await installAuthSession(page, auth)
  await page.goto(`${webBaseUrl}/canvas/${workflow.item.id}`)
  await page.locator('.react-flow').waitFor()
  await page.locator('.react-flow__node').first().waitFor({ state: 'visible' })
  await page.waitForFunction(() => window.__minaWorkflowCanvasYjs?.matchesDocument?.() === true)

  const tracePath = join(outputDir, `workflow-canvas-${nodeCount}-nodes.trace.json`)
  const target = await firstVisibleDraggableNode(page)
  const unrelatedTarget = await firstVisibleDraggableNode(page, target.id)
  let phases: ScenarioSummary['phases'] | undefined

  await collectTrace(page, tracePath, async () => {
    const dragMoveBefore = await readPerf(page)
    const dragMoveProfilerBefore = await readProfilerCommits(page)
    const unrelatedRenderBefore = await readRenderCount(page, unrelatedTarget.id)

    await page.mouse.move(target.x, target.y)
    await page.mouse.down()
    for (let step = 1; step <= 36; step += 1) {
      await page.mouse.move(target.x + step * 5, target.y + step * 2.5)
    }
    const dragMoveAfter = await readPerf(page)
    const dragMoveProfilerAfter = (await readProfilerCommits(page)).slice(dragMoveProfilerBefore.length)
    const unrelatedRenderDuringDrag = await readRenderCount(page, unrelatedTarget.id)

    const dragStopBefore = dragMoveAfter
    const dragStopProfilerBefore = await readProfilerCommits(page)
    await page.mouse.up()
    await page.waitForFunction(
      (documentCommits) => (window.__minaWorkflowCanvasPerf?.documentCommits ?? 0) > documentCommits,
      dragStopBefore.documentCommits,
    )
    await page.getByRole('button', { name: /save/i }).click()
    await page.getByText('Saved').waitFor()
    await page.waitForFunction(() => window.__minaWorkflowCanvasYjs?.matchesDocument?.() === true)
    const dragStopAfter = await readPerf(page)
    const dragStopProfilerAfter = (await readProfilerCommits(page)).slice(dragStopProfilerBefore.length)

    const panBefore = await readPerf(page)
    const panProfilerBefore = await readProfilerCommits(page)
    const flow = page.locator('.react-flow')
    const box = await flow.boundingBox()
    if (!box) {
      throw new Error('React Flow viewport did not render a bounding box.')
    }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, -900)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 - 220, box.y + box.height / 2 - 120, { steps: 20 })
    await page.mouse.up()
    const panAfter = await readPerf(page)
    const panProfilerAfter = (await readProfilerCommits(page)).slice(panProfilerBefore.length)

    phases = {
      dragMove: phaseSummary(
        dragMoveAfter,
        dragMoveBefore,
        dragMoveProfilerAfter,
        unrelatedRenderDuringDrag - unrelatedRenderBefore,
      ),
      dragStopAndSave: phaseSummary(dragStopAfter, dragStopBefore, dragStopProfilerAfter),
      panZoom: phaseSummary(panAfter, panBefore, panProfilerAfter),
    }
  })

  if (!phases) {
    throw new Error('Performance scenario did not collect phase summaries.')
  }
  await page.waitForFunction(() => window.__minaWorkflowCanvasYjs?.matchesDocument?.() === true)
  const traceSizeBytes = (await stat(tracePath)).size

  return {
    nodeCount,
    phases,
    traceFile: relative(process.cwd(), tracePath),
    traceSizeBytes,
    yjsMatchesDocument: await page.evaluate(() => window.__minaWorkflowCanvasYjs?.matchesDocument?.() === true),
  }
}

await mkdir(outputDir, { recursive: true })

const request = await playwrightRequest.newContext()
const browser = await chromium.launch({ headless: true })
const auth = await register(request)
const summaries: ScenarioSummary[] = []

try {
  for (const nodeCount of [20, 100, 500]) {
    const page = await browser.newPage()
    try {
      summaries.push(await runScenario(request, page, auth, nodeCount))
    } finally {
      await page.close()
    }
  }
} finally {
  await browser.close()
  await request.dispose()
}

const summaryPath = join(outputDir, 'workflow-canvas-performance-summary.json')
await writeFile(
  summaryPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      scenarios: summaries,
    },
    null,
    2,
  )}\n`,
  'utf8',
)

console.log(`Workflow canvas performance evidence written to ${relative(process.cwd(), summaryPath)}`)
