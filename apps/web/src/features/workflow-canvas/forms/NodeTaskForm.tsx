import { useCallback, useEffect, useMemo, useState } from 'react'
import { Maximize2, Zap } from 'lucide-react'
import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import type { MediaSlotName, NodeMediaSlotItem, NodeMediaSlots } from '@mina/contracts/modules/media'
import type { TaskDraftConfig } from '@mina/contracts/modules/tasks'
import type { TaskModelDescriptor } from '@mina/contracts/modules/tasks/model-catalog'

import {
  activeModelForTask,
  formValueToTask,
  taskToFormValue,
  type NodeTaskFormValue,
  type TaskParams,
} from './model-form-utils'
import { useNodeTaskAppForm } from './form-context'
import { AdvancedConfigGroup } from './field-groups/AdvancedConfigGroup'
import { MediaInputsFieldGroup } from './field-groups/MediaInputsFieldGroup'
import { ModelConfigToolbar } from './field-groups/ModelConfigToolbar'
import { PromptFieldGroup } from './field-groups/PromptFieldGroup'

interface NodeTaskFormProps {
  mediaActions?: {
    onAddUpload(slot: MediaSlotName, file: File): void
    onChange(item: NodeMediaSlotItem): void
    onRemove(slot: MediaSlotName, slotItemId: string): void
    onReplaceUpload(slot: MediaSlotName, slotItemId: string, file: File): void
    onReorder(slot: MediaSlotName, orderedIds: string[]): void
    uploading?: boolean | undefined
  } | undefined
  models: TaskModelDescriptor[]
  node: WorkflowCanvasNode
  onChange(task: TaskDraftConfig): void
  onRun(): void
  runError?: string | undefined
  running?: boolean | undefined
  task: TaskDraftConfig
}

const syncTask = (onChange: NodeTaskFormProps['onChange'], value: NodeTaskFormValue) => {
  onChange(formValueToTask(value))
}

const EMPTY_MEDIA_SLOTS: NodeMediaSlots = {}

export function NodeTaskForm({ mediaActions, models, node, onChange, onRun, runError, running, task }: NodeTaskFormProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const activeModel = useMemo(() => activeModelForTask(models, task), [models, task])
  const advancedFields = (activeModel?.fields ?? []).filter((field) => field.section !== 'basic')
  const mediaSlots =
    node.data.nodeType === 'image_generation' || node.data.nodeType === 'video_generation'
      ? node.data.mediaSlots ?? EMPTY_MEDIA_SLOTS
      : EMPTY_MEDIA_SLOTS
  const form = useNodeTaskAppForm({
    defaultValues: taskToFormValue(task, mediaSlots),
    validators: {
      onChange: ({ value }) => {
        if (!value.prompt.trim()) {
          return { fields: { prompt: 'Prompt is required.' } }
        }
        return undefined
      },
    },
    onSubmit: ({ value }) => syncTask(onChange, value),
  })
  useEffect(() => {
    form.setFieldValue('mediaSlots', mediaSlots)
  }, [form, mediaSlots])
  const syncCurrentForm = useCallback(() => {
    syncTask(onChange, form.state.values)
  }, [form, onChange])

  return (
    <form
      className="mina-wc-task-form"
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void form.handleSubmit()
      }}
    >
      {mediaActions ? (
        <form.Field name="mediaSlots">
          {(field) => (
            <MediaInputsFieldGroup
              mediaSlots={field.state.value}
              node={node}
              uploading={mediaActions.uploading}
              onAddUpload={mediaActions.onAddUpload}
              onChange={mediaActions.onChange}
              onMediaSlotsChange={field.handleChange}
              onRemove={mediaActions.onRemove}
              onReplaceUpload={mediaActions.onReplaceUpload}
              onReorder={mediaActions.onReorder}
            />
          )}
        </form.Field>
      ) : null}

      <div className="mina-wc-prompt-shell">
        <button className="mina-wc-expand-button" type="button" title="Expand composer" aria-label="Expand composer">
          <Maximize2 aria-hidden="true" size={18} />
        </button>
        <form.Field
          name="prompt"
          validators={{
            onChange: ({ value }: { value: string }) => (value.trim() ? undefined : 'Prompt is required.'),
          }}
        >
          {(field) => (
            <PromptFieldGroup
              value={field.state.value}
              error={field.state.meta.errors[0] ? String(field.state.meta.errors[0]) : undefined}
              onBlur={field.handleBlur}
              onChange={(value) => {
                field.handleChange(value)
                syncCurrentForm()
              }}
            />
          )}
        </form.Field>
      </div>

      <section className="mina-wc-config-section" aria-label="Model configuration">
        <form.Subscribe selector={(state) => state.values}>
          {(currentValue) => {
            const canSubmit = Boolean(currentValue.prompt.trim())
            return (
              <>
                <form.Field name="provider">
                  {(providerField) => (
                    <form.Field name="model">
                      {(modelField) => (
                        <form.Field name="params">
                          {(paramsField) => {
                            const changeParams = (params: TaskParams) => {
                              paramsField.handleChange(params)
                              syncCurrentForm()
                            }
                            return (
                              <>
                                <ModelConfigToolbar
                                  advancedOpen={advancedOpen}
                                  canSubmit={canSubmit}
                                  models={models}
                                  onModelChange={(provider, model, params) => {
                                    providerField.handleChange(provider)
                                    modelField.handleChange(model)
                                    paramsField.handleChange(params)
                                    syncCurrentForm()
                                  }}
                                  onParamsChange={changeParams}
                                  onRun={onRun}
                                  value={currentValue}
                                  runError={runError}
                                  running={running}
                                  setAdvancedOpen={setAdvancedOpen}
                                />

                                {advancedOpen ? (
                                  <AdvancedConfigGroup
                                    fields={advancedFields}
                                    onParamsChange={changeParams}
                                    params={paramsField.state.value}
                                  />
                                ) : null}
                              </>
                            )
                          }}
                        </form.Field>
                      )}
                    </form.Field>
                  )}
                </form.Field>
              </>
            )
          }}
        </form.Subscribe>
        <div className="mina-wc-credit-line">
          <Zap aria-hidden="true" size={13} />
          <span>14</span>
        </div>
      </section>
    </form>
  )
}
