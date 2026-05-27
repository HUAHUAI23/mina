import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { FormApi, FormValidateOrFn } from '@tanstack/react-form'
import type { MediaSlotName, NodeMediaSlotItem, NodeMediaSlots } from '@mina/contracts/modules/media'
import type { TaskDraftConfig } from '@mina/contracts/modules/tasks'

import { useMessages } from '../../../app/i18n-provider'
import { uploadMediaObject } from '../api/media-mutations'
import type { MediaGenerationCanvasNode } from '../domain/canvas-node-types'
import {
  defaultMediaSlotForNodeType,
  isMediaSlotAllowedForNodeType,
  normalizeMediaSlotsForNodeType,
} from '../domain/media-slot-policy'
import { useNodeTaskAppForm, type NodeTaskFormApi } from '../forms/form-context'
import {
  defaultFormValueForKind,
  formValueWithCompatibleModel,
  tasksEqual,
} from '../forms/model-compatibility'
import { formValueToTask, taskToFormValue, type NodeTaskFormValue } from '../forms/model-form-utils'
import { resolveClientModel } from '../forms/registry/client-model-registry'
import { createNodeTaskValidators } from '../forms/validation'
import { useCanvasStore } from '../store/canvas-store'
import type { ComposerDraftState } from '../store/canvas-ui-store'
import { useCanvasUiStore } from '../store/canvas-ui-store'
import { assignSlotOrder, normalizeSlotOrder } from '../utils/media-slots'

export type MediaTaskFormTarget =
  | { kind: 'node'; node: MediaGenerationCanvasNode; onRun(): void }
  | { kind: 'draft'; draft: ComposerDraftState; onSubmitDraft(snapshot: ComposerDraftState): Promise<void> }

type MediaTaskFormProviderProps = MediaTaskFormTarget & {
  children(props: MediaTaskFormRenderProps): ReactNode
}

export interface MediaTaskFormRenderProps {
  commitTask(value: NodeTaskFormValue): void
  composerId: string
  form: NodeTaskFormApi
  mediaSlots: NodeMediaSlots
  mediaActions: {
    onAddUpload(slot: MediaSlotName, file: File, options?: { position?: 'end' | 'start' }): void
    onChange(item: NodeMediaSlotItem): void
    onRemove(slot: MediaSlotName, slotItemId: string): void
    onReplaceUpload(slot: MediaSlotName, slotItemId: string, file: File): void
    onReorder(slot: MediaSlotName, orderedIds: string[]): void
    uploading?: boolean | undefined
  }
  nodeType: MediaGenerationCanvasNode['data']['nodeType']
}

const MediaTaskFormContext = createContext<MediaTaskFormRenderProps | undefined>(undefined)

export const useMediaTaskForm = (): MediaTaskFormRenderProps => {
  const value = useContext(MediaTaskFormContext)
  if (!value) {
    throw new Error('useMediaTaskForm must be used inside MediaTaskFormProvider')
  }
  return value
}

const emptyMediaSlots = {}

type NodeTaskFormBaseApi = FormApi<
  NodeTaskFormValue,
  undefined,
  FormValidateOrFn<NodeTaskFormValue>,
  undefined,
  undefined,
  undefined,
  FormValidateOrFn<NodeTaskFormValue>,
  undefined,
  undefined,
  undefined,
  undefined,
  unknown
>

const createSlotItem = (slot: MediaSlotName, mediaObjectId: string, order: number): NodeMediaSlotItem => ({
  id: `slot_item_${crypto.randomUUID()}`,
  order,
  required: true,
  slot,
  source: { type: 'media_object', mediaObjectId },
})

const cloneTaskValue = (value: NodeTaskFormValue): NodeTaskFormValue => ({
  ...value,
  params: { ...value.params },
})

const cloneMediaSlots = (slots: NodeMediaSlots): NodeMediaSlots => structuredClone(slots)

const taskMediaCapabilities = (task: Pick<TaskDraftConfig, 'kind' | 'model' | 'provider'> | undefined) =>
  task ? resolveClientModel({ kind: task.kind, model: task.model, provider: task.provider })?.mediaCapabilities : undefined

const itemWithMediaObject = (item: NodeMediaSlotItem, mediaObjectId: string): NodeMediaSlotItem => ({
  ...item,
  source: { type: 'media_object', mediaObjectId },
})

const addSlotItemToSlots = (
  slots: NodeMediaSlots,
  item: NodeMediaSlotItem,
  position: 'end' | 'start',
): NodeMediaSlots => {
  const currentItems = normalizeSlotOrder(slots[item.slot] ?? [])
  const insertIndex = position === 'start' ? 0 : currentItems.length
  return {
    ...slots,
    [item.slot]: assignSlotOrder([
      ...currentItems.slice(0, insertIndex),
      { ...item, order: insertIndex },
      ...currentItems.slice(insertIndex),
    ]),
  }
}

const changeSlotItemInSlots = (
  slots: NodeMediaSlots,
  item: NodeMediaSlotItem,
): NodeMediaSlots => ({
  ...slots,
  [item.slot]: normalizeSlotOrder((slots[item.slot] ?? []).map((candidate) => (candidate.id === item.id ? item : candidate))),
})

const removeSlotItemFromSlots = (
  slots: NodeMediaSlots,
  slot: MediaSlotName,
  slotItemId: string,
): NodeMediaSlots => ({
  ...slots,
  [slot]: normalizeSlotOrder((slots[slot] ?? []).filter((item) => item.id !== slotItemId)),
})

const reorderSlotItemsInSlots = (
  slots: NodeMediaSlots,
  slot: MediaSlotName,
  orderedIds: readonly string[],
): NodeMediaSlots => {
  const currentItems = normalizeSlotOrder(slots[slot] ?? [])
  const itemsById = new Map(currentItems.map((item) => [item.id, item]))
  const orderedItems = orderedIds
    .map((id) => itemsById.get(id))
    .filter((item): item is NodeMediaSlotItem => Boolean(item))
  const orderedSet = new Set(orderedIds)
  return {
    ...slots,
    [slot]: assignSlotOrder([...orderedItems, ...currentItems.filter((item) => !orderedSet.has(item.id))]),
  }
}

const replaceSlotItemMediaObjectInSlots = (
  slots: NodeMediaSlots,
  slot: MediaSlotName,
  slotItemId: string,
  mediaObjectId: string,
): NodeMediaSlots => ({
  ...slots,
  [slot]: normalizeSlotOrder(
    (slots[slot] ?? []).map((item) => (item.id === slotItemId ? itemWithMediaObject(item, mediaObjectId) : item)),
  ),
})

interface MediaSlotsBinding {
  addUpload(slot: MediaSlotName, file: File, options?: { position?: 'end' | 'start' }): void
  actions: MediaTaskFormRenderProps['mediaActions']
}

export function MediaTaskFormProvider(props: MediaTaskFormProviderProps) {
  return props.kind === 'node'
    ? <NodeTargetProvider {...props} />
    : <DraftTargetProvider {...props} />
}

function NodeTargetProvider({
  children,
  node,
  onRun,
}: Extract<MediaTaskFormProviderProps, { kind: 'node' }>) {
  const m = useMessages()
  const [uploading, setUploading] = useState(false)
  const setNodeTaskConfig = useCanvasStore((state) => state.setNodeTaskConfig)

  const mediaSlots = node.data.mediaSlots ?? emptyMediaSlots
  const task = node.data.config.task
  const defaultValues = useMemo(
    () => (task ? formValueWithCompatibleModel(taskToFormValue(task), mediaSlots, m) : defaultFormValueForKind(node.data.nodeType, mediaSlots, m)),
    [m, mediaSlots, node.data.nodeType, task],
  )
  const transform = useCompatibleFormTransform(mediaSlots, m)
  const nodeTaskValidators = useMemo(() => createNodeTaskValidators(m), [m])
  const form = useNodeTaskAppForm({
    defaultValues,
    formId: `node-task:${node.id}`,
    listeners: {
      onChangeDebounceMs: 200,
      onChange: ({ formApi }) => {
        const nextTask = formValueToTask(formApi.state.values)
        if (task && tasksEqual(task, nextTask)) {
          return
        }
        setNodeTaskConfig(node.id, nextTask)
      },
    },
    transform,
    validators: nodeTaskValidators,
    onSubmit: ({ value }) => {
      const nextTask = formValueToTask(value)
      if (!task || !tasksEqual(task, nextTask)) {
        setNodeTaskConfig(node.id, nextTask)
      }
      onRun()
    },
  })
  const binding = useNodeMediaSlotsBinding(node, setUploading, uploading)
  const commitTask = (value: NodeTaskFormValue) => {
    const nextTask = formValueToTask(value)
    if (!task || !tasksEqual(task, nextTask)) {
      setNodeTaskConfig(node.id, nextTask)
    }
  }

  const value: MediaTaskFormRenderProps = {
    commitTask,
    composerId: `node:${node.id}`,
    form,
    mediaActions: binding.actions,
    mediaSlots,
    nodeType: node.data.nodeType,
  }

  return (
    <MediaTaskFormContext.Provider value={value}>
      <MediaTaskPasteTarget nodeType={node.data.nodeType} onAddUpload={binding.addUpload}>
        {children(value)}
      </MediaTaskPasteTarget>
    </MediaTaskFormContext.Provider>
  )
}

function useNodeMediaSlotsBinding(
  node: MediaGenerationCanvasNode,
  setUploading: (uploading: boolean) => void,
  uploading: boolean,
): MediaSlotsBinding {
  const nodeId = node.id
  const addSlotItem = useCanvasStore((state) => state.addSlotItem)
  const removeSlotItem = useCanvasStore((state) => state.removeSlotItem)
  const reorderSlotItems = useCanvasStore((state) => state.reorderSlotItems)
  const replaceSlotItemMediaObject = useCanvasStore((state) => state.replaceSlotItemMediaObject)
  const updateSlotItem = useCanvasStore((state) => state.updateSlotItem)

  const uploadAndAttach = async (
    input:
      | { file: File; kind: 'add'; position: 'end' | 'start'; slot: MediaSlotName }
      | { file: File; kind: 'replace'; slot: MediaSlotName; slotItemId: string },
  ) => {
    setUploading(true)
    try {
      const response = await uploadMediaObject(input.file)
      if (input.kind === 'add') {
        addSlotItem(
          nodeId,
          createSlotItem(
            input.slot,
            response.item.id,
            input.position === 'start' ? 0 : Number.MAX_SAFE_INTEGER,
          ),
        )
        return
      }
      replaceSlotItemMediaObject(nodeId, input.slot, input.slotItemId, response.item.id)
    } finally {
      setUploading(false)
    }
  }

  const addUpload: MediaSlotsBinding['addUpload'] = (slot, file, options) => {
    void uploadAndAttach({ file, kind: 'add', position: options?.position ?? 'start', slot })
  }

  return {
    addUpload,
    actions: {
      onAddUpload: addUpload,
      onChange: (item) => updateSlotItem(nodeId, item),
      onRemove: (slot, slotItemId) => removeSlotItem(nodeId, slot, slotItemId),
      onReorder: (slot, orderedIds) => reorderSlotItems(nodeId, slot, orderedIds),
      onReplaceUpload: (slot, slotItemId, file) => {
        void uploadAndAttach({ file, kind: 'replace', slot, slotItemId })
      },
      uploading,
    },
  }
}

function DraftTargetProvider({
  children,
  draft,
  onSubmitDraft,
}: Extract<MediaTaskFormProviderProps, { kind: 'draft' }>) {
  const m = useMessages()
  const setDraftTask = useCanvasUiStore((state) => state.setDraftTask)

  const mediaSlots = draft.mediaSlots ?? emptyMediaSlots
  const defaultValues = useMemo(() => formValueWithCompatibleModel(draft.task, mediaSlots, m), [draft.task, m, mediaSlots])
  const transform = useCompatibleFormTransform(mediaSlots, m)
  const nodeTaskValidators = useMemo(() => createNodeTaskValidators(m), [m])
  const form = useNodeTaskAppForm({
    defaultValues,
    formId: 'node-task:draft',
    listeners: {
      onChangeDebounceMs: 200,
      onChange: ({ formApi }) => {
        setDraftTask(cloneTaskValue(formApi.state.values))
      },
    },
    transform,
    validators: nodeTaskValidators,
    onSubmit: async ({ value }) => {
      const nextTask = cloneTaskValue(value)
      setDraftTask(nextTask)
      await onSubmitDraft({
        ...useCanvasUiStore.getState().composerDraft,
        mediaSlots: cloneMediaSlots(useCanvasUiStore.getState().composerDraft.mediaSlots),
        task: nextTask,
      })
    },
  })
  const binding = useDraftMediaSlotsBinding(draft)
  const commitTask = (value: NodeTaskFormValue) => {
    setDraftTask(cloneTaskValue(value))
  }

  const value: MediaTaskFormRenderProps = {
    commitTask,
    composerId: 'draft',
    form,
    mediaActions: binding.actions,
    mediaSlots,
    nodeType: draft.task.kind,
  }

  return (
    <MediaTaskFormContext.Provider value={value}>
      <MediaTaskPasteTarget nodeType={draft.task.kind} onAddUpload={binding.addUpload}>
        {children(value)}
      </MediaTaskPasteTarget>
    </MediaTaskFormContext.Provider>
  )
}

function useDraftMediaSlotsBinding(draft: ComposerDraftState): MediaSlotsBinding {
  const m = useMessages()
  const beginUpload = useCanvasUiStore((state) => state.beginDraftUpload)
  const completeUpload = useCanvasUiStore((state) => state.completeDraftUpload)
  const failUpload = useCanvasUiStore((state) => state.failDraftUpload)
  const setDraftError = useCanvasUiStore((state) => state.setDraftError)
  const setDraftMediaSlots = useCanvasUiStore((state) => state.setDraftMediaSlots)

  const updateDraftSlots = (task: NodeTaskFormValue, nextSlots: NodeMediaSlots) => {
    setDraftMediaSlots(normalizeMediaSlotsForNodeType(task.kind, nextSlots, taskMediaCapabilities(task), m))
  }

  const uploadAndAttach = async (
    input:
      | { file: File; kind: 'add'; position: 'end' | 'start'; slot: MediaSlotName; uploadId: string }
      | { file: File; kind: 'replace'; slot: MediaSlotName; slotItemId: string; uploadId: string },
  ) => {
    const currentDraft = useCanvasUiStore.getState().composerDraft
    if (!isMediaSlotAllowedForNodeType(currentDraft.task.kind, input.slot, taskMediaCapabilities(currentDraft.task), m)) {
      setDraftError(m.workflow_canvas_error_media_slot_incompatible())
      return
    }
    beginUpload(input.uploadId, input.slot)
    try {
      const response = await uploadMediaObject(input.file)
      const latestDraft = useCanvasUiStore.getState().composerDraft
      const latestSlots = cloneMediaSlots(latestDraft.mediaSlots)
      if (input.kind === 'add') {
        const nextSlots = addSlotItemToSlots(
          latestSlots,
          createSlotItem(input.slot, response.item.id, 0),
          input.position,
        )
        updateDraftSlots(latestDraft.task, nextSlots)
        completeUpload(input.uploadId)
        return
      }
      updateDraftSlots(
        latestDraft.task,
        replaceSlotItemMediaObjectInSlots(latestSlots, input.slot, input.slotItemId, response.item.id),
      )
      completeUpload(input.uploadId)
    } catch (error) {
      failUpload(input.uploadId, error instanceof Error ? error.message : m.workflow_canvas_error_attach_media())
    }
  }

  const addUpload: MediaSlotsBinding['addUpload'] = (slot, file, options) => {
    void uploadAndAttach({
      file,
      kind: 'add',
      position: options?.position ?? 'start',
      slot,
      uploadId: `upload_${crypto.randomUUID()}`,
    })
  }

  return {
    addUpload,
    actions: {
      onAddUpload: addUpload,
      onChange: (item) => updateDraftSlots(draft.task, changeSlotItemInSlots(draft.mediaSlots, item)),
      onRemove: (slot, slotItemId) => updateDraftSlots(draft.task, removeSlotItemFromSlots(draft.mediaSlots, slot, slotItemId)),
      onReorder: (slot, orderedIds) => updateDraftSlots(draft.task, reorderSlotItemsInSlots(draft.mediaSlots, slot, orderedIds)),
      onReplaceUpload: (slot, slotItemId, file) => {
        void uploadAndAttach({
          file,
          kind: 'replace',
          slot,
          slotItemId,
          uploadId: `upload_${crypto.randomUUID()}`,
        })
      },
      uploading: Object.values(draft.uploads).some((entry) => entry.status === 'uploading'),
    },
  }
}

function useCompatibleFormTransform(mediaSlots: NodeMediaSlots, m: ReturnType<typeof useMessages>) {
  return useCallback((formApi: unknown) => {
    const nodeTaskFormApi = formApi as NodeTaskFormBaseApi
    const currentValue = nodeTaskFormApi.state.values
    const nextValue = formValueWithCompatibleModel(currentValue, mediaSlots, m)
    if (
      nextValue.kind === currentValue.kind &&
      nextValue.provider === currentValue.provider &&
      nextValue.model === currentValue.model
    ) {
      return nodeTaskFormApi
    }
    nodeTaskFormApi.state.values = nextValue
    return nodeTaskFormApi
  }, [m, mediaSlots])
}

const isEditablePasteTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  return Boolean(target.closest('textarea,input,[contenteditable="true"]'))
}

function MediaTaskPasteTarget({
  children,
  nodeType,
  onAddUpload,
}: {
  children: ReactNode
  nodeType: MediaGenerationCanvasNode['data']['nodeType']
  onAddUpload(slot: MediaSlotName, file: File, options?: { position?: 'end' | 'start' }): void
}) {
  const m = useMessages()
  const defaultSlot = defaultMediaSlotForNodeType(nodeType, undefined, m)

  return (
    <div
      className="mina-wc-media-task-composer"
      data-mina-canvas-ignore="true"
      onDragOver={(event) => {
        if (isEditablePasteTarget(event.target)) {
          return
        }
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
      onDrop={(event) => {
        if (isEditablePasteTarget(event.target)) {
          return
        }
        const file = Array.from(event.dataTransfer.files).find((candidate) =>
          candidate.type.startsWith('image/') || candidate.type.startsWith('video/') || candidate.type.startsWith('audio/'),
        )
        if (!file || !defaultSlot) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        onAddUpload(defaultSlot, file, { position: 'start' })
      }}
      onPaste={(event) => {
        if (isEditablePasteTarget(event.target)) {
          return
        }
        const file = Array.from(event.clipboardData.items)
          .map((item) => (item.kind === 'file' ? item.getAsFile() : null))
          .find((candidate): candidate is File => Boolean(candidate))
        if (!file || !defaultSlot) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        onAddUpload(defaultSlot, file, { position: 'start' })
      }}
    >
      {children}
    </div>
  )
}
