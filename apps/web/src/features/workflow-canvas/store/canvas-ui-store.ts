import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { MediaSlotName, NodeMediaSlotItem, NodeMediaSlots } from '@mina/contracts/modules/media'

import { isMediaGenerationNode, type MediaGenerationCanvasNode } from '../domain/canvas-node-types'
import { normalizeMediaSlotsForNodeType } from '../domain/media-slot-policy'
import { defaultPromptForKind, defaultFormValueForKind, formValueWithCompatibleModel } from '../forms/model-compatibility'
import { taskToFormValue, type NodeTaskFormValue } from '../forms/model-form-utils'
import { listAllClientModels, modelKey, resolveClientModel } from '../forms/registry/client-model-registry'
import { assignSlotOrder, normalizeSlotOrder } from '../utils/media-slots'
import { useCanvasStore } from './canvas-store'
import '../forms/registry'

export type NodePanelType = 'config'

export interface ActiveNodePanel {
  nodeId: string
  panel: NodePanelType
}

export interface DraftUploadEntry {
  errorMessage?: string | undefined
  slot: MediaSlotName
  status: 'error' | 'uploading'
}

export interface ComposerDraftState {
  error?: string | undefined
  expanded: boolean
  mediaSlots: NodeMediaSlots
  task: NodeTaskFormValue
  uploads: Record<string, DraftUploadEntry>
}

interface CanvasUiState {
  activeNodePanel: ActiveNodePanel | undefined
  advancedOpenByComposerId: Record<string, boolean>
  composerDraft: ComposerDraftState
  selectedSlotByComposerId: Record<string, MediaSlotName | undefined>
  selectedNodeIds: string[]
}

interface CanvasUiActions {
  beginDraftUpload(uploadId: string, slot: MediaSlotName): void
  closeNodePanel(): void
  completeDraftUpload(uploadId: string, item?: NodeMediaSlotItem | undefined): void
  failDraftUpload(uploadId: string, message: string): void
  openNodePanel(nodeId: string, panel: NodePanelType): void
  resetComposerDraft(): void
  selectNodeIds(ids: readonly string[]): void
  setDraftError(error: string | undefined): void
  setDraftExpanded(expanded: boolean): void
  setDraftFromNode(node: MediaGenerationCanvasNode): void
  setDraftMediaSlots(slots: NodeMediaSlots): void
  setDraftTask(task: NodeTaskFormValue): void
  setComposerAdvancedOpen(composerId: string, open: boolean): void
  setComposerSelectedSlot(composerId: string, slot: MediaSlotName | undefined): void
}

type CanvasUiStore = CanvasUiState & CanvasUiActions

export const LAST_WORKFLOW_COMPOSER_MODEL_KEY = 'mina:workflow-canvas:last-model:v1'

const sameIds = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((id, index) => id === right[index])

const cloneMediaSlots = (mediaSlots: NodeMediaSlots | undefined): NodeMediaSlots =>
  structuredClone(mediaSlots ?? {})

const initialTaskValue = (): NodeTaskFormValue => {
  const savedModelKey = readLastModelKey()
  const savedSpec = savedModelKey
    ? listAllClientModels().find((spec) => modelKey(spec.key) === savedModelKey)
    : undefined
  if (savedSpec) {
    return formValueWithCompatibleModel(
      {
        kind: savedSpec.key.kind,
        model: savedSpec.key.model,
        params: { ...savedSpec.defaults },
        prompt: defaultPromptForKind(savedSpec.key.kind),
        provider: savedSpec.key.provider,
      },
      {},
    )
  }
  return defaultFormValueForKind('image_generation', {})
}

const createDefaultComposerDraft = (): ComposerDraftState => ({
  expanded: false,
  mediaSlots: {},
  task: initialTaskValue(),
  uploads: {},
})

const readLastModelKey = (): string | undefined => {
  if (typeof window === 'undefined') {
    return undefined
  }
  try {
    return window.localStorage.getItem(LAST_WORKFLOW_COMPOSER_MODEL_KEY) ?? undefined
  } catch {
    return undefined
  }
}

export const rememberLastComposerModel = (value: NodeTaskFormValue): void => {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(LAST_WORKFLOW_COMPOSER_MODEL_KEY, modelKey(value))
  } catch {
    // Local storage is a preference cache only; failing to write it should not block canvas work.
  }
}

const cloneTask = (task: NodeTaskFormValue): NodeTaskFormValue => ({
  ...task,
  params: { ...task.params },
})

const normalizeDraftMediaSlots = (
  nodeType: NodeTaskFormValue['kind'],
  mediaSlots: NodeMediaSlots,
  task?: NodeTaskFormValue | undefined,
): NodeMediaSlots => {
  const spec = task
    ? resolveClientModel({ kind: task.kind, model: task.model, provider: task.provider })
    : undefined
  const compatibleSlots = normalizeMediaSlotsForNodeType(nodeType, cloneMediaSlots(mediaSlots), spec?.mediaCapabilities)
  const nextSlots: NodeMediaSlots = {}
  for (const [slot, items] of Object.entries(compatibleSlots) as Array<[MediaSlotName, NodeMediaSlotItem[]]>) {
    const mediaObjectItems = items.filter((item) => {
      if (item.source.type === 'media_object') {
        return true
      }
      if (import.meta.env.DEV) {
        throw new Error(`composerDraft.mediaSlots may only contain media_object sources, got ${item.source.type}`)
      }
      return false
    })
    if (mediaObjectItems.length > 0) {
      nextSlots[slot] = normalizeSlotOrder(mediaObjectItems)
    }
  }
  return nextSlots
}

export const useCanvasUiStore = create<CanvasUiStore>()(subscribeWithSelector((set) => ({
  activeNodePanel: undefined,
  advancedOpenByComposerId: {},
  composerDraft: createDefaultComposerDraft(),
  selectedSlotByComposerId: {},
  beginDraftUpload: (uploadId, slot) =>
    set((state) => ({
      composerDraft: {
        ...state.composerDraft,
        error: undefined,
        uploads: {
          ...state.composerDraft.uploads,
          [uploadId]: { slot, status: 'uploading' },
        },
      },
    })),
  closeNodePanel: () => set({ activeNodePanel: undefined }),
  completeDraftUpload: (uploadId, item) =>
    set((state) => ({
      composerDraft: completeUpload(state.composerDraft, uploadId, item),
    })),
  failDraftUpload: (uploadId, message) =>
    set((state) => {
      const entry = state.composerDraft.uploads[uploadId]
      if (!entry) {
        return {
          composerDraft: {
            ...state.composerDraft,
            error: message,
          },
        }
      }
      return {
        composerDraft: {
          ...state.composerDraft,
          error: message,
          uploads: {
            ...state.composerDraft.uploads,
            [uploadId]: {
              ...entry,
              errorMessage: message,
              status: 'error',
            },
          },
        },
      }
    }),
  openNodePanel: (nodeId, panel) => set({ activeNodePanel: { nodeId, panel } }),
  resetComposerDraft: () => set({ composerDraft: createDefaultComposerDraft() }),
  selectedNodeIds: [],
  selectNodeIds: (ids) =>
    set((state) =>
      sameIds(state.selectedNodeIds, ids)
        ? state
        : { selectedNodeIds: [...ids] },
    ),
  setDraftError: (error) =>
    set((state) => ({
      composerDraft: {
        ...state.composerDraft,
        ...(error ? { error } : { error: undefined }),
      },
    })),
  setDraftExpanded: (expanded) =>
    set((state) =>
      state.composerDraft.expanded === expanded
        ? state
        : { composerDraft: { ...state.composerDraft, expanded } },
    ),
  setDraftFromNode: (node) =>
    set({
      composerDraft: {
        expanded: false,
        // Deselect snapshots intentionally copy the task only; node media sources stay node-owned.
        mediaSlots: {},
        task: node.data.config.task
          ? taskToFormValue(node.data.config.task)
          : defaultFormValueForKind(node.data.nodeType, {}),
        uploads: {},
      },
    }),
  setDraftMediaSlots: (slots) =>
    set((state) => {
      const nextSlots = normalizeDraftMediaSlots(state.composerDraft.task.kind, slots, state.composerDraft.task)
      return {
        composerDraft: {
          ...state.composerDraft,
          error: undefined,
          mediaSlots: nextSlots,
        },
      }
    }),
  setDraftTask: (task) =>
    set((state) => {
      const nextTask = cloneTask(task)
      const mediaSlots = normalizeDraftMediaSlots(nextTask.kind, state.composerDraft.mediaSlots, nextTask)
      return {
        composerDraft: {
          ...state.composerDraft,
          error: undefined,
          mediaSlots,
          task: nextTask,
        },
      }
    }),
  setComposerAdvancedOpen: (composerId, open) =>
    set((state) => {
      if (state.advancedOpenByComposerId[composerId] === open) {
        return state
      }
      return {
        advancedOpenByComposerId: {
          ...state.advancedOpenByComposerId,
          [composerId]: open,
        },
      }
    }),
  setComposerSelectedSlot: (composerId, slot) =>
    set((state) => {
      if (state.selectedSlotByComposerId[composerId] === slot) {
        return state
      }
      return {
        selectedSlotByComposerId: {
          ...state.selectedSlotByComposerId,
          [composerId]: slot,
        },
      }
    }),
})))

export const getCanvasUiSnapshot = () => useCanvasUiStore.getState()

const completeUpload = (
  draft: ComposerDraftState,
  uploadId: string,
  item: NodeMediaSlotItem | undefined,
): ComposerDraftState => {
  const { [uploadId]: _completed, ...uploads } = draft.uploads
  if (!item) {
    return {
      ...draft,
      error: undefined,
      uploads,
    }
  }
  const currentItems = normalizeSlotOrder(draft.mediaSlots[item.slot] ?? [])
  const insertIndex = Math.min(Math.max(item.order, 0), currentItems.length)
  const mediaSlots = {
    ...draft.mediaSlots,
    [item.slot]: assignSlotOrder([
      ...currentItems.slice(0, insertIndex),
      item,
      ...currentItems.slice(insertIndex),
    ]),
  }
  const normalizedSlots = normalizeDraftMediaSlots(draft.task.kind, mediaSlots)
  return {
    ...draft,
    error: undefined,
    mediaSlots: normalizedSlots,
    uploads,
  }
}

useCanvasUiStore.subscribe(
  (state) => state.selectedNodeIds,
  (nextIds, previousIds) => {
    if (previousIds.length === 1 && nextIds.length === 0) {
      const previousNodeId = previousIds[0]
      const node = useCanvasStore.getState().nodes.find((candidate) => candidate.id === previousNodeId)
      if (isMediaGenerationNode(node)) {
        useCanvasUiStore.getState().setDraftFromNode(node)
      }
    }
  },
)
