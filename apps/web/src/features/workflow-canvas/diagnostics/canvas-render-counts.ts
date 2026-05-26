type RenderCounts = Record<string, number>
type RenderSignatures = Record<string, string>

const globalWindow = typeof window === 'undefined' ? undefined : window
const lastRenderSignatures: RenderSignatures = {}

export const canvasRenderCounts: RenderCounts =
  globalWindow && '__minaWorkflowCanvasRenderCounts' in globalWindow
    ? (globalWindow.__minaWorkflowCanvasRenderCounts as RenderCounts)
    : {}

if (globalWindow) {
  globalWindow.__minaWorkflowCanvasRenderCounts = canvasRenderCounts
}

export const markCanvasNodeRender = (nodeId: string, signature?: string): void => {
  if (!import.meta.env.DEV) {
    return
  }
  if (signature !== undefined && lastRenderSignatures[nodeId] === signature) {
    return
  }
  if (signature !== undefined) {
    lastRenderSignatures[nodeId] = signature
  }
  canvasRenderCounts[nodeId] = (canvasRenderCounts[nodeId] ?? 0) + 1
}

export const resetCanvasNodeRenderCounts = (): void => {
  for (const key of Object.keys(canvasRenderCounts)) {
    delete canvasRenderCounts[key]
  }
  for (const key of Object.keys(lastRenderSignatures)) {
    delete lastRenderSignatures[key]
  }
}

declare global {
  interface Window {
    __minaWorkflowCanvasRenderCounts?: RenderCounts
  }
}
