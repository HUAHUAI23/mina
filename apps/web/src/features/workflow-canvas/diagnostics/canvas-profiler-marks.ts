import type { ProfilerOnRenderCallback } from 'react'

export interface CanvasProfilerCommit {
  actualDuration: number
  baseDuration: number
  commitTime: number
  id: string
  phase: 'mount' | 'nested-update' | 'update'
  startTime: number
}

const globalWindow = typeof window === 'undefined' ? undefined : window

export const canvasProfilerCommits: CanvasProfilerCommit[] =
  globalWindow && '__minaWorkflowCanvasProfiler' in globalWindow
    ? (globalWindow.__minaWorkflowCanvasProfiler as CanvasProfilerCommit[])
    : []

if (globalWindow) {
  globalWindow.__minaWorkflowCanvasProfiler = canvasProfilerCommits
}

export const recordCanvasProfilerCommit: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime,
) => {
  if (!import.meta.env.DEV) {
    return
  }
  canvasProfilerCommits.push({
    actualDuration,
    baseDuration,
    commitTime,
    id,
    phase,
    startTime,
  })
}

export const resetCanvasProfilerCommits = (): void => {
  canvasProfilerCommits.length = 0
}

declare global {
  interface Window {
    __minaWorkflowCanvasProfiler?: CanvasProfilerCommit[]
  }
}
