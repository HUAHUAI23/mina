import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { formOptions } from '@tanstack/react-form'
import type { FormApi } from '@tanstack/react-form'
import type { MediaSlotName, NodeMediaSlotItem } from '@mina/contracts/modules/media'

import { uploadMediaObject } from '../api/media-mutations'
import { useCanvasStore } from '../store/canvas-store'
import { useNodeTaskAppForm, type NodeTaskFormApi } from '../forms/form-context'
import { formValueToTask, taskToFormValue, type NodeTaskFormValue } from '../forms/model-form-utils'
import { validateNodeTaskFormValue } from '../forms/validation'
import {
  defaultFormValueForKind,
  formValuesEqual,
  formValueWithCompatibleModel,
  tasksEqual,
} from '../forms/model-compatibility'
import type { MediaGenerationCanvasNode } from '../domain/canvas-node-types'

interface MediaTaskFormProviderProps {
  children(props: MediaTaskFormRenderProps): ReactNode
  node: MediaGenerationCanvasNode
  onRun(): void
}

export interface MediaTaskFormRenderProps {
  form: NodeTaskFormApi
  mediaActions: {
    onAddUpload(slot: MediaSlotName, file: File, options?: { position?: 'end' | 'start' }): void
    onChange(item: NodeMediaSlotItem): void
    onRemove(slot: MediaSlotName, slotItemId: string): void
    onReplaceUpload(slot: MediaSlotName, slotItemId: string, file: File): void
    onReorder(slot: MediaSlotName, orderedIds: string[]): void
    uploading?: boolean | undefined
  }
}

const MediaTaskFormContext = createContext<MediaTaskFormRenderProps | undefined>(undefined)

export const useMediaTaskForm = (): MediaTaskFormRenderProps => {
  const value = useContext(MediaTaskFormContext)
  if (!value) {
    throw new Error('useMediaTaskForm must be used inside MediaTaskFormProvider')
  }
  return value
}

const createSlotItem = (slot: MediaSlotName, mediaObjectId: string, order: number): NodeMediaSlotItem => ({
  id: `slot_item_${crypto.randomUUID()}`,
  order,
  required: true,
  slot,
  source: { type: 'media_object', mediaObjectId },
})

const emptyMediaSlots = {}

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

const nodeTaskFormOptions = formOptions({
  defaultValues: defaultFormValueForKind('image_generation', {}),
  validators: {
    onChange: validateNodeTaskFormValue,
    onSubmit: validateNodeTaskFormValue,
  },
})

export function MediaTaskFormProvider({ children, node, onRun }: MediaTaskFormProviderProps) {
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
  const lastLocalTaskRef = useRef(task)
  const transform = useCallback((formApi: unknown) => {
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
        lastLocalTaskRef.current = nextTask
        setNodeTaskConfig(node.id, nextTask)
      },
    },
    transform,
    onSubmit: ({ value }) => {
      const nextTask = formValueToTask(value as NodeTaskFormValue)
      if (!task || !tasksEqual(task, nextTask)) {
        lastLocalTaskRef.current = nextTask
        setNodeTaskConfig(node.id, nextTask)
      }
      onRun()
    },
  }) as unknown as NodeTaskFormApi

  useEffect(() => {
    if (!task) {
      return
    }
    const lastLocalTask = lastLocalTaskRef.current
    if (lastLocalTask && tasksEqual(lastLocalTask, task)) {
      return
    }
    const nextValue = formValueWithCompatibleModel(taskToFormValue(task), mediaSlots)
    if (!formValuesEqual(form.state.values as NodeTaskFormValue, nextValue)) {
      form.reset(nextValue)
    }
  }, [form, mediaSlots, task])

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
        const item = createSlotItem(input.slot, response.item.id, order)
        state.addSlotItem(input.nodeId, item)
        return
      }
      state.replaceSlotItemMediaObject(input.nodeId, input.slot, input.slotItemId, response.item.id)
    } finally {
      setUploading(false)
    }
  }
  const addUpload = (slot: MediaSlotName, file: File, options?: { position?: 'end' | 'start' }) => {
    void uploadAndAttach({ file, kind: 'add', nodeId: node.id, position: options?.position ?? 'end', slot })
  }

  const value: MediaTaskFormRenderProps = {
    form,
    mediaActions: {
      uploading,
      onAddUpload: addUpload,
      onChange: (item: NodeMediaSlotItem) => updateSlotItem(node.id, item),
      onRemove: (slot: MediaSlotName, slotItemId: string) => {
        removeSlotItem(node.id, slot, slotItemId)
      },
      onReorder: (slot: MediaSlotName, orderedIds: string[]) => reorderSlotItems(node.id, slot, orderedIds),
      onReplaceUpload: (slot: MediaSlotName, slotItemId: string, file: File) => {
        void uploadAndAttach({ file, kind: 'replace', nodeId: node.id, slot, slotItemId })
      },
    },
  }

  return (
    <MediaTaskFormContext.Provider value={value}>
      <MediaTaskPasteTarget node={node} onAddUpload={addUpload}>
        {children(value)}
      </MediaTaskPasteTarget>
    </MediaTaskFormContext.Provider>
  )
}

function MediaTaskPasteTarget({
  children,
  node,
  onAddUpload,
}: {
  children: ReactNode
  node: MediaGenerationCanvasNode
  onAddUpload(slot: MediaSlotName, file: File, options?: { position?: 'end' | 'start' }): void
}) {
  const defaultSlot = node.data.nodeType === 'video_generation' ? 'firstFrame' : 'inputImages'

  return (
    <div
      className="mina-wc-media-task-composer"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault()
        }
      }}
      onDrop={(event) => {
        const file = Array.from(event.dataTransfer.files).find((candidate) =>
          candidate.type.startsWith('image/') || candidate.type.startsWith('video/') || candidate.type.startsWith('audio/'),
        )
        if (!file) {
          return
        }
        event.preventDefault()
        onAddUpload(defaultSlot, file)
      }}
      onPaste={(event) => {
        const file = Array.from(event.clipboardData.items)
          .map((item) => (item.kind === 'file' ? item.getAsFile() : null))
          .find((candidate): candidate is File => Boolean(candidate))
        if (!file) {
          return
        }
        event.preventDefault()
        onAddUpload(defaultSlot, file, { position: 'start' })
      }}
    >
      {children}
    </div>
  )
}
