import {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { formOptions } from '@tanstack/react-form'
import type { FormApi } from '@tanstack/react-form'
import type { MediaSlotName, NodeMediaSlotItem, NodeMediaSlots } from '@mina/contracts/modules/media'

import { uploadMediaObject } from '../api/media-mutations'
import type { MediaGenerationCanvasNode } from '../domain/canvas-node-types'
import { defaultMediaSlotForNodeType, isMediaSlotAllowedForNodeType, normalizeMediaSlotsForNodeType } from '../domain/media-slot-policy'
import { useNodeTaskAppForm, type NodeTaskFormApi } from '../forms/form-context'
import {
  defaultFormValueForKind,
  formValueWithCompatibleModel,
  tasksEqual,
} from '../forms/model-compatibility'
import { formValueToTask, taskToFormValue, type NodeTaskFormValue } from '../forms/model-form-utils'
import { validateNodeTaskFormValue } from '../forms/validation'
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

const nodeTaskFormOptions = formOptions({
  defaultValues: defaultFormValueForKind('image_generation', {}),
  validators: {
    onChange: validateNodeTaskFormValue,
    onSubmit: validateNodeTaskFormValue,
  },
})

type NodeTaskFormBaseApi = FormApi<
  NodeTaskFormValue,
  typeof validateNodeTaskFormValue,
  typeof validateNodeTaskFormValue,
  undefined,
  undefined,
  undefined,
  typeof validateNodeTaskFormValue,
  undefined,
  undefined,
  undefined,
  undefined,
  never
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

export function MediaTaskFormProvider(props: MediaTaskFormProviderProps) {
  const targetKey = props.kind === 'node' ? `node:${props.node.id}` : 'draft'
  const content =
    props.kind === 'node'
      ? <NodeTargetProvider {...props} />
      : <DraftTargetProvider {...props} />

  return <Fragment key={targetKey}>{content}</Fragment>
}

function NodeTargetProvider({
  children,
  node,
  onRun,
}: Extract<MediaTaskFormProviderProps, { kind: 'node' }>) {
  const [uploading, setUploading] = useState(false)
  const setNodeTaskConfig = useCanvasStore((state) => state.setNodeTaskConfig)
  const removeSlotItem = useCanvasStore((state) => state.removeSlotItem)
  const reorderSlotItems = useCanvasStore((state) => state.reorderSlotItems)
  const updateSlotItem = useCanvasStore((state) => state.updateSlotItem)

  const mediaSlots = node.data.mediaSlots ?? emptyMediaSlots
  const task = node.data.config.task
  const defaultValues = useMemo(
    () => (task ? formValueWithCompatibleModel(taskToFormValue(task), mediaSlots) : defaultFormValueForKind(node.data.nodeType, mediaSlots)),
    [mediaSlots, node.data.nodeType, task],
  )
  const transform = useCompatibleFormTransform(mediaSlots)
  const form = useNodeTaskAppForm({
    ...nodeTaskFormOptions,
    defaultValues,
    formId: `node-task:${node.id}`,
    listeners: {
      onChangeDebounceMs: 200,
      onChange: ({ formApi }) => {
        const nextTask = formValueToTask(formApi.state.values as NodeTaskFormValue)
        if (task && tasksEqual(task, nextTask)) {
          return
        }
        setNodeTaskConfig(node.id, nextTask)
      },
    },
    transform,
    onSubmit: ({ value }) => {
      const nextTask = formValueToTask(value as NodeTaskFormValue)
      if (!task || !tasksEqual(task, nextTask)) {
        setNodeTaskConfig(node.id, nextTask)
      }
      onRun()
    },
  }) as unknown as NodeTaskFormApi

  const uploadAndAttach = async (
    input:
      | { file: File; kind: 'add'; nodeId: string; position: 'end' | 'start'; slot: MediaSlotName }
      | { file: File; kind: 'replace'; nodeId: string; slot: MediaSlotName; slotItemId: string },
  ) => {
    setUploading(true)
    try {
      const response = await uploadMediaObject(input.file)
      const state = useCanvasStore.getState()
      if (input.kind === 'add') {
        const stateNode = state.nodes.find((candidate) => candidate.id === input.nodeId)
        const current =
          stateNode?.data.nodeType === 'image_generation' || stateNode?.data.nodeType === 'video_generation'
            ? stateNode.data.mediaSlots?.[input.slot] ?? []
            : []
        const order = input.position === 'start' ? 0 : current.length
        state.addSlotItem(input.nodeId, createSlotItem(input.slot, response.item.id, order))
        return
      }
      state.replaceSlotItemMediaObject(input.nodeId, input.slot, input.slotItemId, response.item.id)
    } finally {
      setUploading(false)
    }
  }
  const addUpload = (slot: MediaSlotName, file: File, options?: { position?: 'end' | 'start' }) => {
    void uploadAndAttach({ file, kind: 'add', nodeId: node.id, position: options?.position ?? 'start', slot })
  }
  const commitTask = (value: NodeTaskFormValue) => {
    const nextTask = formValueToTask(value)
    if (!task || !tasksEqual(task, nextTask)) {
      setNodeTaskConfig(node.id, nextTask)
    }
  }

  const value: MediaTaskFormRenderProps = {
    commitTask,
    form,
    mediaActions: {
      onAddUpload: addUpload,
      onChange: (item) => updateSlotItem(node.id, item),
      onRemove: (slot, slotItemId) => removeSlotItem(node.id, slot, slotItemId),
      onReorder: (slot, orderedIds) => reorderSlotItems(node.id, slot, orderedIds),
      onReplaceUpload: (slot, slotItemId, file) => {
        void uploadAndAttach({ file, kind: 'replace', nodeId: node.id, slot, slotItemId })
      },
      uploading,
    },
    mediaSlots,
    nodeType: node.data.nodeType,
  }

  return (
    <MediaTaskFormContext.Provider value={value}>
      <MediaTaskPasteTarget nodeType={node.data.nodeType} onAddUpload={addUpload}>
        {children(value)}
      </MediaTaskPasteTarget>
    </MediaTaskFormContext.Provider>
  )
}

function DraftTargetProvider({
  children,
  draft,
  onSubmitDraft,
}: Extract<MediaTaskFormProviderProps, { kind: 'draft' }>) {
  const beginUpload = useCanvasUiStore((state) => state.beginDraftUpload)
  const completeUpload = useCanvasUiStore((state) => state.completeDraftUpload)
  const failUpload = useCanvasUiStore((state) => state.failDraftUpload)
  const setDraftError = useCanvasUiStore((state) => state.setDraftError)
  const setDraftMediaSlots = useCanvasUiStore((state) => state.setDraftMediaSlots)
  const setDraftTask = useCanvasUiStore((state) => state.setDraftTask)

  const mediaSlots = draft.mediaSlots ?? emptyMediaSlots
  const defaultValues = useMemo(() => formValueWithCompatibleModel(draft.task, mediaSlots), [draft.task, mediaSlots])
  const transform = useCompatibleFormTransform(mediaSlots)
  const form = useNodeTaskAppForm({
    ...nodeTaskFormOptions,
    defaultValues,
    formId: 'node-task:draft',
    listeners: {
      onChangeDebounceMs: 200,
      onChange: ({ formApi }) => {
        setDraftTask(cloneTaskValue(formApi.state.values as NodeTaskFormValue))
      },
    },
    transform,
    onSubmit: async ({ value }) => {
      const nextTask = cloneTaskValue(value as NodeTaskFormValue)
      setDraftTask(nextTask)
      await onSubmitDraft({
        ...useCanvasUiStore.getState().composerDraft,
        mediaSlots: cloneMediaSlots(useCanvasUiStore.getState().composerDraft.mediaSlots),
        task: nextTask,
      })
    },
  }) as unknown as NodeTaskFormApi

  const uploadAndAttach = async (
    input:
      | { file: File; kind: 'add'; position: 'end' | 'start'; slot: MediaSlotName; uploadId: string }
      | { file: File; kind: 'replace'; slot: MediaSlotName; slotItemId: string; uploadId: string },
  ) => {
    const currentDraft = useCanvasUiStore.getState().composerDraft
    if (!isMediaSlotAllowedForNodeType(currentDraft.task.kind, input.slot)) {
      setDraftError('Media slot is not compatible with the selected model type.')
      return
    }
    beginUpload(input.uploadId, input.slot)
    try {
      const response = await uploadMediaObject(input.file)
      if (input.kind === 'add') {
        const latestSlots = useCanvasUiStore.getState().composerDraft.mediaSlots
        const current = normalizeSlotOrder(latestSlots[input.slot] ?? [])
        const order = input.position === 'start' ? 0 : current.length
        completeUpload(input.uploadId, createSlotItem(input.slot, response.item.id, order))
        return
      }
      const latestSlots = cloneMediaSlots(useCanvasUiStore.getState().composerDraft.mediaSlots)
      const nextItems = normalizeSlotOrder(
        (latestSlots[input.slot] ?? []).map((item) =>
          item.id === input.slotItemId
            ? { ...item, source: { type: 'media_object' as const, mediaObjectId: response.item.id } }
            : item,
        ),
      )
      setDraftMediaSlots({
        ...latestSlots,
        [input.slot]: nextItems,
      })
      completeUpload(input.uploadId)
    } catch (error) {
      failUpload(input.uploadId, error instanceof Error ? error.message : 'Unable to attach media.')
    }
  }

  const addUpload = (slot: MediaSlotName, file: File, options?: { position?: 'end' | 'start' }) => {
    void uploadAndAttach({
      file,
      kind: 'add',
      position: options?.position ?? 'start',
      slot,
      uploadId: `upload_${crypto.randomUUID()}`,
    })
  }
  const commitTask = (value: NodeTaskFormValue) => {
    setDraftTask(cloneTaskValue(value))
  }

  const updateDraftSlots = (nextSlots: NodeMediaSlots) => {
    setDraftMediaSlots(normalizeMediaSlotsForNodeType(draft.task.kind, nextSlots))
  }

  const value: MediaTaskFormRenderProps = {
    commitTask,
    form,
    mediaActions: {
      onAddUpload: addUpload,
      onChange: (item) => {
        updateDraftSlots({
          ...draft.mediaSlots,
          [item.slot]: normalizeSlotOrder((draft.mediaSlots[item.slot] ?? []).map((candidate) => (candidate.id === item.id ? item : candidate))),
        })
      },
      onRemove: (slot, slotItemId) => {
        updateDraftSlots({
          ...draft.mediaSlots,
          [slot]: normalizeSlotOrder((draft.mediaSlots[slot] ?? []).filter((item) => item.id !== slotItemId)),
        })
      },
      onReorder: (slot, orderedIds) => {
        const currentItems = normalizeSlotOrder(draft.mediaSlots[slot] ?? [])
        const itemsById = new Map(currentItems.map((item) => [item.id, item]))
        const orderedItems = orderedIds
          .map((id) => itemsById.get(id))
          .filter((item): item is NodeMediaSlotItem => Boolean(item))
        const orderedSet = new Set(orderedIds)
        updateDraftSlots({
          ...draft.mediaSlots,
          [slot]: assignSlotOrder([...orderedItems, ...currentItems.filter((item) => !orderedSet.has(item.id))]),
        })
      },
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
    mediaSlots,
    nodeType: draft.task.kind,
  }

  return (
    <MediaTaskFormContext.Provider value={value}>
      <MediaTaskPasteTarget nodeType={draft.task.kind} onAddUpload={addUpload}>
        {children(value)}
      </MediaTaskPasteTarget>
    </MediaTaskFormContext.Provider>
  )
}

function useCompatibleFormTransform(mediaSlots: NodeMediaSlots) {
  return useCallback((formApi: unknown) => {
    const nodeTaskFormApi = formApi as NodeTaskFormBaseApi
    const currentValue = nodeTaskFormApi.state.values
    const nextValue = formValueWithCompatibleModel(currentValue, mediaSlots)
    if (
      nextValue.kind === currentValue.kind &&
      nextValue.provider === currentValue.provider &&
      nextValue.model === currentValue.model
    ) {
      return nodeTaskFormApi
    }
    nodeTaskFormApi.state.values = nextValue
    return nodeTaskFormApi
  }, [mediaSlots])
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
  const defaultSlot = defaultMediaSlotForNodeType(nodeType)

  return (
    <div
      className="mina-wc-media-task-composer"
      data-mina-canvas-ignore="true"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
      onDrop={(event) => {
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
