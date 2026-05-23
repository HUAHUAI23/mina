import { useState } from 'react'
import { useStore } from '@tanstack/react-form'
import { Zap } from 'lucide-react'

import { AdvancedConfigGroup } from '../../forms/field-groups/AdvancedConfigGroup'
import { ModelConfigToolbar } from '../../forms/field-groups/ModelConfigToolbar'
import {
  deriveGenerationMode,
  deriveModelCompatibilityMode,
  listClientModels,
  paramsForSpec,
  resolveClientModel,
  type ClientModelSpec,
} from '../../forms/registry/client-model-registry'
import { MediaSlotList } from '../../components/media-slots/MediaSlotList'
import { useMediaTaskForm } from '../media-task-form'
import type { ComposerRuntime, ComposerSurface } from '../types'
import type { MediaGenerationCanvasNode } from '../../domain/canvas-node-types'
import type { NodeTaskFormValue } from '../../forms/model-form-utils'

interface MediaComposerBlockProps {
  node: MediaGenerationCanvasNode
  runtime: ComposerRuntime
  surface: Exclude<ComposerSurface, 'hidden'>
}

const configSectionClassName = 'mina-wc-config-section relative grid gap-2 border-t border-[color:color-mix(in_oklch,var(--foreground-quaternary)_10%,transparent)] pt-3.5'
const composerCardClassName = 'mina-wc-composer-card relative grid min-w-0 gap-(--composer-row-gap) overflow-visible [--composer-media-column:96px] [--composer-media-gap:14px] [--composer-media-width:64px] [--composer-row-gap:12px]'
const composerBodyClassName = 'mina-wc-composer-body relative grid min-h-28 min-w-0 grid-cols-[var(--composer-media-column)_minmax(0,1fr)] items-start gap-(--composer-media-gap) overflow-visible'
const attachmentLayerClassName = 'mina-wc-attachment-layer pointer-events-none relative z-[4] min-w-0 w-(--composer-media-column)'
const composerPromptClassName = 'mina-wc-composer-prompt relative z-[1] min-h-28 min-w-0'
const composerPromptTextareaClassName = 'box-border max-h-[min(34dvh,320px)] min-h-28 overflow-y-auto p-0'

export function MediaComposerBlock({ node, runtime }: MediaComposerBlockProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const { form, mediaActions } = useMediaTaskForm()
  const mediaSlots = node.data.mediaSlots ?? {}
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
      <div className="p-2.5 text-[0.74rem] font-bold text-foreground-quaternary">
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
    <section
      aria-label="Node composer"
      className={composerCardClassName}
      data-advanced-open={advancedOpen ? 'true' : undefined}
    >
      <div className={composerBodyClassName}>
        <div className={attachmentLayerClassName}>
          <MediaSlotList
            node={node}
            variant="attachment"
            {...(mediaActions.uploading !== undefined ? { uploading: mediaActions.uploading } : {})}
            onAddUpload={mediaActions.onAddUpload}
            onChange={mediaActions.onChange}
            onRemove={mediaActions.onRemove}
            onReplaceUpload={mediaActions.onReplaceUpload}
            onReorder={mediaActions.onReorder}
          />
        </div>
        <div className={composerPromptClassName}>
          <section className="mina-wc-prompt-section relative min-w-0" aria-label="Prompt">
            <form.AppField name="prompt">
              {(field) => (
                <field.TextField
                  multiline
                  placeholder={node.data.nodeType === 'video_generation' ? 'Describe the motion' : 'Describe the image'}
                  textareaClassName={composerPromptTextareaClassName}
                />
              )}
            </form.AppField>
          </section>
        </div>
      </div>

      <section className={configSectionClassName} aria-label="Model configuration">
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
          runError={runtime.runError}
          running={runtime.runningNodeId === node.id}
          setAdvancedOpen={setAdvancedOpen}
          spec={spec}
        />

        {advancedOpen ? <AdvancedConfigGroup form={form} spec={spec} /> : null}
        {paramError ? <em className="mt-1 block text-[0.72rem] font-bold not-italic text-destructive">{paramError}</em> : null}

        <div className="flex min-h-0 items-center justify-end gap-1.5 text-[0.78rem] font-black text-foreground-quaternary">
          <Zap aria-hidden="true" size={13} />
          <span>14</span>
        </div>
      </section>
    </section>
  )
}
