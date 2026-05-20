interface CanvasPerfCounters {
  autosaveStarts: number
  documentCommits: number
  edgesChangeEvents: number
  renderStateWrites: number
  websocketReconnects: number
  yjsUpdatesReceived: number
  yjsUpdatesSent: number
  nodesChangeEvents: number
}

type CanvasPerfCounterName = keyof CanvasPerfCounters

const createCounters = (): CanvasPerfCounters => ({
  autosaveStarts: 0,
  documentCommits: 0,
  edgesChangeEvents: 0,
  renderStateWrites: 0,
  websocketReconnects: 0,
  yjsUpdatesReceived: 0,
  yjsUpdatesSent: 0,
  nodesChangeEvents: 0,
})

const globalWindow = typeof window === 'undefined' ? undefined : window

export const canvasPerfCounters: CanvasPerfCounters =
  globalWindow && '__minaWorkflowCanvasPerf' in globalWindow
    ? (globalWindow.__minaWorkflowCanvasPerf as CanvasPerfCounters)
    : createCounters()

if (globalWindow) {
  globalWindow.__minaWorkflowCanvasPerf = canvasPerfCounters
}

export const incrementCanvasPerfCounter = (name: CanvasPerfCounterName): void => {
  if (!import.meta.env.DEV) {
    return
  }
  canvasPerfCounters[name] += 1
}

export const markCanvasPerformance = (name: string): void => {
  if (!import.meta.env.DEV || typeof performance === 'undefined') {
    return
  }
  performance.mark(`canvas:${name}`)
}

export const resetCanvasPerfCounters = (): void => {
  for (const key of Object.keys(canvasPerfCounters) as CanvasPerfCounterName[]) {
    canvasPerfCounters[key] = 0
  }
}

declare global {
  interface Window {
    __minaWorkflowCanvasPerf?: CanvasPerfCounters
  }
}
