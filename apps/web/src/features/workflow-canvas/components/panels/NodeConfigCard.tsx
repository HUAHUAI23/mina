import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formOptions } from '@tanstack/react-form'
import type { FormApi } from '@tanstack/react-form'
import { FileText } from 'lucide-react'
import type { MediaSlotName, NodeMediaSlotItem } from '@mina/contracts/modules/media'
import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import { uploadMediaObject } from '../../api/media-mutations'
import { useCanvasStore } from '../../store/canvas-store'
import { PromptField } from '../../forms/shared/PromptField'
import { RunControls } from './RunControls'
import { NodeTaskForm } from '../../forms/NodeTaskForm'
import { useNodeTaskAppForm } from '../../forms/form-context'
import { formValueToTask, taskToFormValue, type NodeTaskFormValue } from '../../forms/model-form-utils'
import { validateNodeTaskFormValue } from '../../forms/validation'
import { defaultFormValueForKind, formValuesEqual, formValueWithCompatibleModel, tasksEqual } from '../../forms/model-compatibility'
import { isMediaGenerationNode, type MediaGenerationCanvasNode } from '../../domain/canvas-node-types'

interface NodeConfigCardProps {
  node: WorkflowCanvasNode
  onRun(): void
  runError?: string | undefined
  running?: boolean | undefined
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

export function NodeConfigCard({ node, onRun, runError, running }: NodeConfigCardProps) {
  const setNodeText = useCanvasStore((state) => state.setNodeText)

  if (node.data.nodeType === 'text') {
    return (
      <section className="mina-wc-config-card nodrag nowheel nopan" data-mina-canvas-ignore="true" data-mina-canvas-panel-root="true">
        <div className="mina-wc-panel-heading">
          <strong>{node.data.title}</strong>
          <span><FileText aria-hidden="true" size={13} />Text</span>
        </div>
        <PromptField value={node.data.config.text} onChange={(value) => setNodeText(node.id, value)} />
      </section>
    )
  }

  if (!isMediaGenerationNode(node)) {
    return (
      <section className="mina-wc-config-card nodrag nowheel nopan" data-mina-canvas-ignore="true" data-mina-canvas-panel-root="true">
        <div className="mina-wc-panel-heading">
          <strong>{node.data.title}</strong>
          <span>{node.data.nodeType === 'flow_group' ? 'Executable scope' : 'Organization'}</span>
        </div>
        {node.data.nodeType === 'flow_group' ? <RunControls onRun={onRun} running={running} error={runError} /> : null}
      </section>
    )
  }

  return <MediaTaskConfigCard node={node} onRun={onRun} runError={runError} running={running} />
}

function MediaTaskConfigCard({ node, onRun, runError, running }: NodeConfigCardProps & { node: MediaGenerationCanvasNode }) {
  const [uploading, setUploading] = useState(false)
  const setNodeTaskConfig = useCanvasStore((state) => state.setNodeTaskConfig)
  const removeSlotItem = useCanvasStore((state) => state.removeSlotItem)
  const reorderSlotItems = useCanvasStore((state) => state.reorderSlotItems)
  const updateSlotItem = useCanvasStore((state) => state.updateSlotItem)

  const uploadAndAttach = async (
    input:
      | { file: File; kind: 'add'; nodeId: string; order: number; slot: MediaSlotName }
      | { file: File; kind: 'replace'; nodeId: string; slot: MediaSlotName; slotItemId: string },
  ) => {
    setUploading(true)
    try {
      const response = await uploadMediaObject(input.file)
      const state = useCanvasStore.getState()
      if (input.kind === 'add') {
        state.addSlotItem(input.nodeId, createSlotItem(input.slot, response.item.id, input.order))
        return
      }
      state.replaceSlotItemMediaObject(input.nodeId, input.slot, input.slotItemId, response.item.id)
    } finally {
      setUploading(false)
    }
  }

  const task = node.data.config.task
  const mediaSlots = node.data.mediaSlots ?? emptyMediaSlots
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
  })

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

  const slotItemCount = (slot: MediaSlotName) =>
    node.data.mediaSlots?.[slot]?.length ?? 0
  return (
    <section className="mina-wc-config-card nodrag nowheel nopan" data-mina-canvas-ignore="true" data-mina-canvas-panel-root="true">
      <div className="mina-wc-panel-heading sr-only">
        <strong>{node.data.title}</strong>
        <span>{node.data.nodeType === 'image_generation' ? 'Image' : 'Video'}</span>
      </div>
      {task ? (
        <NodeTaskForm
          key={node.id}
          form={form}
          mediaActions={{
            uploading,
            onAddUpload: (slot, file) => {
              void uploadAndAttach({ file, kind: 'add', nodeId: node.id, order: slotItemCount(slot), slot })
            },
            onChange: (item) => updateSlotItem(node.id, item),
            onRemove: (slot, slotItemId) => {
              removeSlotItem(node.id, slot, slotItemId)
            },
            onReorder: (slot, orderedIds) => reorderSlotItems(node.id, slot, orderedIds),
            onReplaceUpload: (slot, slotItemId, file) => {
              void uploadAndAttach({ file, kind: 'replace', nodeId: node.id, slot, slotItemId })
            },
          }}
          mediaSlots={mediaSlots}
          node={node}
          running={running}
          runError={runError}
        />
      ) : null}
    </section>
  )
}
