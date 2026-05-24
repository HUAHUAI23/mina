import { useState } from 'react'
import { useStore } from '@tanstack/react-form'
import { Zap } from 'lucide-react'

import { AdvancedConfigGroup } from '../../forms/field-groups/AdvancedConfigGroup'
import { ModelConfigToolbar } from '../../forms/field-groups/ModelConfigToolbar'
import {
  deriveGenerationMode,
  deriveModelCompatibilityMode,
  listAllClientModels,
  listClientModels,
  paramsForSpec,
  resolveClientModel,
  type ClientModelSpec,
} from '../../forms/registry/client-model-registry'
import { MediaSlotList } from '../../components/media-slots/MediaSlotList'
import { useMediaTaskForm } from '../media-task-form'
import type { NodeTaskFormValue } from '../../forms/model-form-utils'

interface MediaComposerShellProps {
  mode: 'collapsed' | 'expanded'
  modelScope?: 'all' | 'compatible-kind' | undefined
  onExpand?: (() => void) | undefined
  runError?: string | undefined
  running?: boolean | undefined
  submitDisabled?: boolean | undefined
}

const configSectionClassName = 'mina-wc-config-section relative grid gap-2 border-t border-[color:color-mix(in_oklch,var(--foreground-quaternary)_10%,transparent)] pt-3.5'
const composerCardClassName = 'mina-wc-composer-card relative grid min-w-0 gap-(--composer-row-gap) overflow-visible [--composer-media-column:96px] [--composer-media-gap:14px] [--composer-media-width:64px] [--composer-row-gap:12px]'
const composerBodyClassName = 'mina-wc-composer-body relative grid min-h-28 min-w-0 grid-cols-[var(--composer-media-column)_minmax(0,1fr)] items-start gap-(--composer-media-gap) overflow-visible'
const attachmentLayerClassName = 'mina-wc-attachment-layer pointer-events-none relative z-[4] min-w-0 w-(--composer-media-column)'
const composerPromptClassName = 'mina-wc-composer-prompt relative z-[1] min-h-28 min-w-0'
const composerPromptTextareaClassName = 'box-border max-h-[min(34dvh,320px)] min-h-28 overflow-y-auto p-0'
const collapsedShellClassName = 'mina-wc-empty-composer grid min-h-[52px] min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 bg-transparent p-0 max-[720px]:gap-2'
const collapsedPromptInputClassName = 'h-11 max-h-11 min-h-11 min-w-0 truncate rounded-[14px] border-0 bg-transparent px-0 py-0 text-left text-[0.98rem] font-semibold leading-[2.75rem] text-foreground outline-0 placeholder:text-foreground-quaternary hover:bg-surface-container-low focus:bg-surface-container-low focus-visible:bg-surface-container-low'
const collapsedRunButtonClassName = 'flex size-12 flex-none items-center justify-center rounded-full border-0 bg-foreground text-primary-foreground disabled:bg-surface-container-high disabled:text-foreground-quaternary'
const emptyErrorClassName = 'col-span-full m-0 text-[0.72rem] text-destructive'

export function MediaComposerShell({
  mode,
  modelScope = 'compatible-kind',
  onExpand,
  runError,
  running,
  submitDisabled,
}: MediaComposerShellProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const { commitTask, form, mediaActions, mediaSlots, nodeType } = useMediaTaskForm()
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
  const selectableModels = modelScope === 'all' ? listAllClientModels() : undefined
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
  const canSubmit = Boolean(currentValue.prompt.trim()) && !submitDisabled && !mediaActions.uploading

  const changeModel = (nextSpec: ClientModelSpec) => {
    const nextValue: NodeTaskFormValue = {
      ...currentValue,
      kind: nextSpec.key.kind,
      model: nextSpec.key.model,
      params: paramsForSpec(currentValue.params, nextSpec),
      provider: nextSpec.key.provider,
    }
    form.setFieldValue('kind', nextValue.kind, { dontRunListeners: true })
    form.setFieldValue('provider', nextValue.provider, { dontRunListeners: true })
    form.setFieldValue('model', nextValue.model, { dontRunListeners: true })
    form.setFieldValue('params', nextValue.params, { dontRunListeners: true })
    form.validate('change')
    commitTask(nextValue)
  }

  if (!spec) {
    return (
      <div className="p-2.5 text-[0.74rem] font-bold text-foreground-quaternary">
        No registered {currentValue.kind} models are available for {generationMode}.
      </div>
    )
  }

  if (mode === 'collapsed') {
    return (
      <section aria-label="Draft composer" className={collapsedShellClassName}>
        <div className="relative min-w-0" onPointerDown={onExpand}>
          <MediaSlotList
            mediaSlots={mediaSlots}
            nodeType={nodeType}
            variant="collapsed"
            {...(mediaActions.uploading !== undefined ? { uploading: mediaActions.uploading } : {})}
            onAddUpload={(slot, file, options) => {
              onExpand?.()
              mediaActions.onAddUpload(slot, file, options)
            }}
            onChange={mediaActions.onChange}
            onRemove={mediaActions.onRemove}
            onReplaceUpload={mediaActions.onReplaceUpload}
            onReorder={mediaActions.onReorder}
          />
        </div>
        <form.AppField name="prompt">
          {(field) => (
            <div onFocusCapture={onExpand} onPointerDown={onExpand}>
              <field.TextField
                ariaLabel="Prompt"
                inputClassName={collapsedPromptInputClassName}
                placeholder={currentValue.kind === 'video_generation' ? 'Describe the motion' : 'Describe the image'}
              />
            </div>
          )}
        </form.AppField>
        <button
          aria-label="Run prompt"
          className={collapsedRunButtonClassName}
          disabled={!canSubmit || running}
          onClick={() => {
            void form.handleSubmit()
          }}
          title={mediaActions.uploading ? 'Uploading' : 'Run prompt'}
          type="button"
        >
          <Zap aria-hidden="true" size={20} />
        </button>
        {runError ? <p className={emptyErrorClassName}>{runError}</p> : null}
      </section>
    )
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
            mediaSlots={mediaSlots}
            nodeType={nodeType}
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
                  placeholder={nodeType === 'video_generation' ? 'Describe the motion' : 'Describe the image'}
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
          models={selectableModels}
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
        {paramError ? <em className="mt-1 block text-[0.72rem] font-bold not-italic text-destructive">{paramError}</em> : null}

        <div className="flex min-h-0 items-center justify-end gap-1.5 text-[0.78rem] font-black text-foreground-quaternary">
          <Zap aria-hidden="true" size={13} />
          <span>14</span>
        </div>
      </section>
    </section>
  )
}
