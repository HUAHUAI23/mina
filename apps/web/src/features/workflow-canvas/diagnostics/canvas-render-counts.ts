type RenderCounts = Record<string, number>

const globalWindow = typeof window === 'undefined' ? undefined : window

export const canvasRenderCounts: RenderCounts =
  globalWindow && '__minaWorkflowCanvasRenderCounts' in globalWindow
    ? (globalWindow.__minaWorkflowCanvasRenderCounts as RenderCounts)
    : {}

if (globalWindow) {
  globalWindow.__minaWorkflowCanvasRenderCounts = canvasRenderCounts
}

export const markCanvasNodeRender = (nodeId: string): void => {
  if (!import.meta.env.DEV) {
    return
  }
  canvasRenderCounts[nodeId] = (canvasRenderCounts[nodeId] ?? 0) + 1
}

export const resetCanvasNodeRenderCounts = (): void => {
  for (const key of Object.keys(canvasRenderCounts)) {
    delete canvasRenderCounts[key]
  }
}

declare global {
  interface Window {
    __minaWorkflowCanvasRenderCounts?: RenderCounts
  }
}
