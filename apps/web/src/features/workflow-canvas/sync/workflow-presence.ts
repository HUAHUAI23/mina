import { create } from 'zustand'
import type { Viewport, XYPosition } from '@xyflow/react'

export interface WorkflowAwarenessState {
  cursor?: XYPosition | undefined
  dragging?: {
    nodeIds: string[]
    positions: Record<string, XYPosition>
  } | undefined
  selection?: {
    edgeIds: string[]
    nodeIds: string[]
  } | undefined
  user: {
    color: string
    id: string
    name: string
  }
  viewport?: Viewport | undefined
}

interface WorkflowPresenceStore {
  local: WorkflowAwarenessState
  peers: Record<string, WorkflowAwarenessState>
  setLocalDragging(dragging: WorkflowAwarenessState['dragging']): void
  setLocalSelection(selection: WorkflowAwarenessState['selection']): void
  setLocalViewport(viewport: Viewport): void
  setPeers(peers: Record<string, WorkflowAwarenessState>): void
}

const localUserId = (): string => {
  const key = 'mina.workflow.presence.userId'
  if (typeof window === 'undefined') {
    return `presence_${crypto.randomUUID()}`
  }
  const existing = window.sessionStorage.getItem(key)
  if (existing) {
    return existing
  }
  const created = crypto.randomUUID()
  window.sessionStorage.setItem(key, created)
  return created
}

const localUserColor = (id: string): string => {
  const palette = ['#2563eb', '#16a34a', '#db2777', '#ea580c', '#7c3aed', '#0891b2']
  const index = Array.from(id).reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length
  return palette[index] ?? '#2563eb'
}

const createLocalAwareness = (): WorkflowAwarenessState => {
  const id = localUserId()
  return {
    user: {
      color: localUserColor(id),
      id,
      name: 'Local user',
    },
  }
}

export const useWorkflowPresenceStore = create<WorkflowPresenceStore>((set) => ({
  local: createLocalAwareness(),
  peers: {},
  setLocalDragging: (dragging) =>
    set((state) => ({ local: { ...state.local, dragging } })),
  setLocalSelection: (selection) =>
    set((state) => ({ local: { ...state.local, selection } })),
  setLocalViewport: (viewport) =>
    set((state) => ({ local: { ...state.local, viewport } })),
  setPeers: (peers) => set({ peers }),
}))

const createAnimationFrameThrottle = <TValue>(callback: (value: TValue) => void) => {
  let frame: number | undefined
  let latest: TValue
  return (value: TValue) => {
    latest = value
    if (frame !== undefined) {
      return
    }
    if (typeof window === 'undefined') {
      callback(latest)
      return
    }
    frame = window.requestAnimationFrame(() => {
      frame = undefined
      callback(latest)
    })
  }
}

const createTimedThrottle = <TValue>(callback: (value: TValue) => void, intervalMs: number) => {
  let latest: TValue
  let lastRun = 0
  let timeout: number | undefined
  return (value: TValue) => {
    latest = value
    const now = Date.now()
    const run = () => {
      timeout = undefined
      lastRun = Date.now()
      callback(latest)
    }
    const delay = Math.max(0, intervalMs - (now - lastRun))
    if (delay === 0 && timeout === undefined) {
      run()
      return
    }
    if (timeout === undefined) {
      if (typeof window === 'undefined') {
        run()
        return
      }
      timeout = window.setTimeout(run, delay)
    }
  }
}

const publishDraggingFrame = createAnimationFrameThrottle<WorkflowAwarenessState['dragging']>((dragging) => {
  useWorkflowPresenceStore.getState().setLocalDragging(dragging)
})

const publishViewportFrame = createTimedThrottle<Viewport>((viewport) => {
  useWorkflowPresenceStore.getState().setLocalViewport(viewport)
}, 200)

export const publishLocalDragging = (dragging: WorkflowAwarenessState['dragging']): void => {
  publishDraggingFrame(dragging)
}

export const publishLocalViewport = (viewport: Viewport): void => {
  publishViewportFrame(viewport)
}

export const publishLocalSelection = (selection: WorkflowAwarenessState['selection']): void => {
  useWorkflowPresenceStore.getState().setLocalSelection(selection)
}
