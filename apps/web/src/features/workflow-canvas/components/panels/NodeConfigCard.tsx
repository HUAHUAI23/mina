import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { MediaSlotName, NodeMediaSlotItem } from '@mina/contracts/modules/media'
import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import { uploadMediaObject } from '../../api/media-mutations'
import { taskKeys } from '../../api/workflow-keys'
import { listTaskModels } from '../../api/model-catalog-queries'
import { useCanvasStore } from '../../store/canvas-store'
import { AdvancedSettingsPanel } from '../../forms/shared/AdvancedSettingsPanel'
import { MediaSlotList } from '../media-slots/MediaSlotList'
import { PromptField } from '../../forms/shared/PromptField'
import { ProviderModelSection } from '../../forms/shared/ProviderModelSection'
import { RunControls } from './RunControls'

interface NodeConfigCardProps {
  node: WorkflowCanvasNode
  nodes: WorkflowCanvasNode[]
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

export function NodeConfigCard({ node, nodes, onRun, runError, running }: NodeConfigCardProps) {
  const [uploading, setUploading] = useState(false)
  const setNodeTaskConfig = useCanvasStore((state) => state.setNodeTaskConfig)
  const setNodeText = useCanvasStore((state) => state.setNodeText)
  const removeSlotItem = useCanvasStore((state) => state.removeSlotItem)
  const reorderSlotItem = useCanvasStore((state) => state.reorderSlotItem)
  const addSlotItem = useCanvasStore((state) => state.addSlotItem)
  const updateSlotItem = useCanvasStore((state) => state.updateSlotItem)
  const modelsQuery = useQuery({ queryFn: listTaskModels, queryKey: taskKeys.models() })
  const uploadMutation = useMutation({
    mutationFn: uploadMediaObject,
    onSettled: () => setUploading(false),
  })

  if (node.data.nodeType === 'text') {
    return (
      <section className="mina-wc-config-card">
        <div className="mina-wc-panel-heading">
          <strong>{node.data.title}</strong>
          <span>Text</span>
        </div>
        <PromptField value={node.data.config.text} onChange={(value) => setNodeText(node.id, value)} />
      </section>
    )
  }

  if (node.data.nodeType !== 'image_generation' && node.data.nodeType !== 'video_generation') {
    return (
      <section className="mina-wc-config-card">
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
  const activeModel = task
    ? models.find((model) => model.kind === task.kind && model.provider === task.provider && model.model === task.model)
    : undefined

  return (
    <section className="mina-wc-config-card">
      <div className="mina-wc-panel-heading">
        <strong>{node.data.title}</strong>
        <span>{node.data.nodeType === 'image_generation' ? 'Image' : 'Video'}</span>
      </div>
      <MediaSlotList
        node={node}
        nodes={nodes}
        uploading={uploading}
        onAddUpload={(slot, file) => {
          setUploading(true)
          uploadMutation.mutate(file, {
            onSuccess: (response) => {
              const items = node.data.nodeType === 'image_generation' || node.data.nodeType === 'video_generation'
                ? node.data.mediaSlots?.[slot] ?? []
                : []
              addSlotItem(node.id, createSlotItem(slot, response.item.id, items.length))
            },
          })
        }}
        onChange={(item) => updateSlotItem(node.id, item)}
        onMove={(slot, slotItemId, direction) => reorderSlotItem(node.id, slot, slotItemId, direction)}
        onRemove={(slot, slotItemId) => removeSlotItem(node.id, slot, slotItemId)}
      />
      {task ? (
        <>
          <PromptField value={task.prompt} onChange={(value) => setNodeTaskConfig(node.id, { ...task, prompt: value })} />
          <ProviderModelSection models={models} task={task} onChange={(nextTask) => setNodeTaskConfig(node.id, nextTask)} />
          <AdvancedSettingsPanel model={activeModel} task={task} onChange={(nextTask) => setNodeTaskConfig(node.id, nextTask)} />
        </>
      ) : null}
      <RunControls disabled={!task} onRun={onRun} running={running} error={runError} />
    </section>
  )
}
