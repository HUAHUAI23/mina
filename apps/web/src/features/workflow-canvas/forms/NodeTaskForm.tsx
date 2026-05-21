import { useState } from 'react'
import { Maximize2, Zap } from 'lucide-react'
import { useStore } from '@tanstack/react-form'
import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import type { MediaSlotName, NodeMediaSlotItem, NodeMediaSlots } from '@mina/contracts/modules/media'

import { AdvancedConfigGroup } from './field-groups/AdvancedConfigGroup'
import { MediaInputsFieldGroup } from './field-groups/MediaInputsFieldGroup'
import { ModelConfigToolbar } from './field-groups/ModelConfigToolbar'
import { withNodeTaskForm } from './form-context'
import type { NodeTaskFormValue } from './model-form-utils'
import {
  deriveModelCompatibilityMode,
  deriveGenerationMode,
  listClientModels,
  paramsForSpec,
  resolveClientModel,
  type ClientModelSpec,
} from './registry'

interface NodeTaskFormRenderProps {
  mediaActions?: {
    onAddUpload(slot: MediaSlotName, file: File): void
    onChange(item: NodeMediaSlotItem): void
    onRemove(slot: MediaSlotName, slotItemId: string): void
    onReplaceUpload(slot: MediaSlotName, slotItemId: string, file: File): void
    onReorder(slot: MediaSlotName, orderedIds: string[]): void
    uploading?: boolean | undefined
  } | undefined
  mediaSlots: NodeMediaSlots
  node: WorkflowCanvasNode
  runError?: string | undefined
  running?: boolean | undefined
}

const nodeTaskFormDefaults: NodeTaskFormValue = {
  kind: 'image_generation',
  model: '',
  params: {},
  prompt: '',
  provider: '',
}

export const NodeTaskForm = withNodeTaskForm({
  defaultValues: nodeTaskFormDefaults,
  props: {
    mediaActions: undefined as NodeTaskFormRenderProps['mediaActions'],
    mediaSlots: {} as NodeMediaSlots,
    node: undefined as WorkflowCanvasNode | undefined,
    runError: undefined as string | undefined,
    running: undefined as boolean | undefined,
  },
  render: function NodeTaskFormRender({ form, mediaActions, mediaSlots, node, runError, running }) {
    const [advancedOpen, setAdvancedOpen] = useState(false)
    const currentValue = useStore(form.store, (state) => {
      const values = state.values as NodeTaskFormValue
      return {
        kind: values.kind,
        model: values.model,
        params: values.params,
        prompt: values.prompt,
        provider: values.provider,
      }
    })

    if (!node) {
      return null
    }

    const compatibilityMode = deriveModelCompatibilityMode(mediaSlots)
    const generationMode = deriveGenerationMode(currentValue.kind, mediaSlots)
    const compatible = listClientModels(currentValue.kind, compatibilityMode)
    const resolvedSpec = resolveClientModel({
      kind: currentValue.kind,
      provider: currentValue.provider,
      model: currentValue.model,
    })
    const spec =
      resolvedSpec && (compatibilityMode === 'media' ? resolvedSpec.supportsMedia : resolvedSpec.supportsText)
        ? resolvedSpec
        : compatible[0]
    const paramError = useStore(form.store, (state) => {
      const paramsMeta = state.fieldMeta.params
      return paramsMeta?.errors[0] ? String(paramsMeta.errors[0]) : undefined
    })

    if (!spec) {
      return (
        <div className="mina-wc-panel-empty">
          No registered {currentValue.kind} models are available for {generationMode}.
        </div>
      )
    }

    const canSubmit = Boolean(currentValue.prompt.trim())

    const changeModel = (nextSpec: ClientModelSpec) => {
      form.setFieldValue('provider', nextSpec.key.provider, { dontRunListeners: true })
      form.setFieldValue('model', nextSpec.key.model, { dontRunListeners: true })
      form.setFieldValue('params', paramsForSpec(currentValue.params, nextSpec))
      form.validate('change')
    }

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
          <MediaInputsFieldGroup
            node={node}
            uploading={mediaActions.uploading}
            onAddUpload={mediaActions.onAddUpload}
            onChange={mediaActions.onChange}
            onRemove={mediaActions.onRemove}
            onReplaceUpload={mediaActions.onReplaceUpload}
            onReorder={mediaActions.onReorder}
          />
        ) : null}

        <div className="mina-wc-prompt-shell">
          <button className="mina-wc-expand-button" type="button" title="Expand composer" aria-label="Expand composer">
            <Maximize2 aria-hidden="true" size={18} />
          </button>
          <section className="mina-wc-prompt-section" aria-label="Prompt">
            <form.AppField name="prompt">
              {(field) => <field.TextField multiline />}
            </form.AppField>
          </section>
        </div>

        <section className="mina-wc-config-section" aria-label="Model configuration">
          <ModelConfigToolbar
            advancedOpen={advancedOpen}
            canSubmit={canSubmit}
            compatibilityMode={compatibilityMode}
            form={form}
            generationMode={generationMode}
            onModelChange={changeModel}
            onRun={() => {
              void form.handleSubmit()
            }}
            runError={runError}
            running={running}
            setAdvancedOpen={setAdvancedOpen}
            spec={spec}
          />

          {advancedOpen ? <AdvancedConfigGroup form={form} spec={spec} /> : null}
          {paramError ? <em className="mina-wc-field-error">{paramError}</em> : null}

          <div className="mina-wc-credit-line">
            <Zap aria-hidden="true" size={13} />
            <span>14</span>
          </div>
        </section>
      </form>
    )
  },
})
