import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import type { MediaSlotName, NodeMediaSlotItem } from '@mina/contracts/modules/media'
import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import { uploadMediaObject } from '../../api/media-mutations'
import { taskKeys } from '../../api/workflow-keys'
import { listTaskModels } from '../../api/model-catalog-queries'
import { useCanvasStore } from '../../store/canvas-store'
import { PromptField } from '../../forms/shared/PromptField'
import { RunControls } from './RunControls'
import { NodeTaskForm } from '../../forms/NodeTaskForm'

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

export function NodeConfigCard({ node, onRun, runError, running }: NodeConfigCardProps) {
  const [uploading, setUploading] = useState(false)
  const setNodeTaskConfig = useCanvasStore((state) => state.setNodeTaskConfig)
  const setNodeText = useCanvasStore((state) => state.setNodeText)
  const removeSlotItem = useCanvasStore((state) => state.removeSlotItem)
  const reorderSlotItems = useCanvasStore((state) => state.reorderSlotItems)
  const updateSlotItem = useCanvasStore((state) => state.updateSlotItem)
  const modelsQuery = useQuery({ queryFn: listTaskModels, queryKey: taskKeys.models() })

  const uploadAndAttach = async (
    input:
      | { file: File; kind: 'add'; nodeId: string; order: number; slot: MediaSlotName }
      | { file: File; kind: 'replace'; nodeId: string; slot: MediaSlotName; slotItemId: string },
  ) => {
    setUploading(true)
    try {
      const response = await uploadMediaObject(input.file)
      if (input.kind === 'add') {
        useCanvasStore.getState().addSlotItem(input.nodeId, createSlotItem(input.slot, response.item.id, input.order))
        return
      }
      useCanvasStore.getState().replaceSlotItemMediaObject(input.nodeId, input.slot, input.slotItemId, response.item.id)
    } finally {
      setUploading(false)
    }
  }

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

  if (node.data.nodeType !== 'image_generation' && node.data.nodeType !== 'video_generation') {
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

  const task = node.data.config.task
  const models = modelsQuery.data?.items ?? []
  const slotItemCount = (slot: MediaSlotName) =>
    node.data.nodeType === 'image_generation' || node.data.nodeType === 'video_generation'
      ? node.data.mediaSlots?.[slot]?.length ?? 0
      : 0
  return (
    <section className="mina-wc-config-card nodrag nowheel nopan" data-mina-canvas-ignore="true" data-mina-canvas-panel-root="true">
      <div className="mina-wc-panel-heading sr-only">
        <strong>{node.data.title}</strong>
        <span>{node.data.nodeType === 'image_generation' ? 'Image' : 'Video'}</span>
      </div>
      {task ? (
        <NodeTaskForm
          key={node.id}
          mediaActions={{
            uploading,
            onAddUpload: (slot, file) => {
              void uploadAndAttach({ file, kind: 'add', nodeId: node.id, order: slotItemCount(slot), slot })
            },
            onChange: (item) => updateSlotItem(node.id, item),
            onRemove: (slot, slotItemId) => removeSlotItem(node.id, slot, slotItemId),
            onReorder: (slot, orderedIds) => reorderSlotItems(node.id, slot, orderedIds),
            onReplaceUpload: (slot, slotItemId, file) => {
              void uploadAndAttach({ file, kind: 'replace', nodeId: node.id, slot, slotItemId })
            },
          }}
          models={models}
          node={node}
          task={task}
          onChange={(nextTask) => setNodeTaskConfig(node.id, nextTask)}
          onRun={onRun}
          running={running}
          runError={runError}
        />
      ) : null}
    </section>
  )
}
