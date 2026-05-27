import { useStore } from '@tanstack/react-form'
import type { DeepKeys } from '@tanstack/react-form'
import { Zap } from 'lucide-react'

import { useMessages } from '../../../../app/i18n-provider'
import { AdvancedConfigGroup } from '../../forms/field-groups/AdvancedConfigGroup'
import { ModelConfigToolbar } from '../../forms/field-groups/ModelConfigToolbar'
import {
  deriveGenerationMode,
  deriveModelCompatibilityMode,
  paramsForSpec,
  useClientModelRegistry,
  type ClientModelSpec,
} from '../../forms/registry/client-model-registry'
import { MediaSlotList } from '../../components/media-slots/MediaSlotList'
import { useCanvasUiStore } from '../../store/canvas-ui-store'
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

interface ComposerModelState {
  canSubmit: boolean
  changeModel(nextSpec: ClientModelSpec): void
  compatibilityMode: ReturnType<typeof deriveModelCompatibilityMode>
  currentValue: NodeTaskFormValue
  generationMode: ReturnType<typeof deriveGenerationMode>
  paramError: string | undefined
  selectableModels: ClientModelSpec[] | undefined
  spec: ClientModelSpec | undefined
}

const setFormValues = (
  form: ReturnType<typeof useMediaTaskForm>['form'],
  value: NodeTaskFormValue,
): void => {
  form.setFieldValue('kind' as DeepKeys<NodeTaskFormValue>, value.kind, {
    dontRunListeners: true,
    dontUpdateMeta: true,
    dontValidate: true,
  })
  form.setFieldValue('provider' as DeepKeys<NodeTaskFormValue>, value.provider, {
    dontRunListeners: true,
    dontUpdateMeta: true,
    dontValidate: true,
  })
  form.setFieldValue('model' as DeepKeys<NodeTaskFormValue>, value.model, {
    dontRunListeners: true,
    dontUpdateMeta: true,
    dontValidate: true,
  })
  form.setFieldValue('params' as DeepKeys<NodeTaskFormValue>, value.params, {
    dontRunListeners: true,
    dontUpdateMeta: true,
    dontValidate: true,
  })
  void form.validate('change')
}

function useComposerModel({
  modelScope,
  submitDisabled,
}: {
  modelScope: 'all' | 'compatible-kind'
  submitDisabled?: boolean | undefined
}): ComposerModelState {
  const { commitTask, form, mediaActions, mediaSlots } = useMediaTaskForm()
  const kind = useStore(form.store, (state) => (state.values as NodeTaskFormValue).kind)
  const provider = useStore(form.store, (state) => (state.values as NodeTaskFormValue).provider)
  const model = useStore(form.store, (state) => (state.values as NodeTaskFormValue).model)
  const params = useStore(form.store, (state) => (state.values as NodeTaskFormValue).params)
  const prompt = useStore(form.store, (state) => (state.values as NodeTaskFormValue).prompt)
  const registry = useClientModelRegistry()
  const currentValue: NodeTaskFormValue = { kind, model, params, prompt, provider }
  const compatibilityMode = deriveModelCompatibilityMode(mediaSlots)
  const generationMode = deriveGenerationMode(currentValue.kind, mediaSlots)
  const compatible = registry.listModels(currentValue.kind, compatibilityMode)
  const selectableModels = modelScope === 'all' ? registry.listAll() : undefined
  const resolvedSpec = registry.resolve({
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
    setFormValues(form, nextValue)
    commitTask(nextValue)
  }

  return {
    canSubmit,
    changeModel,
    compatibilityMode,
    currentValue,
    generationMode,
    paramError,
    selectableModels,
    spec,
  }
}

function ComposerMediaSection({
  modelSpec,
  onExpand,
  variant,
}: {
  modelSpec: ClientModelSpec | undefined
  onExpand?: (() => void) | undefined
  variant: 'attachment' | 'collapsed'
}) {
  const { composerId, mediaActions, mediaSlots, nodeType } = useMediaTaskForm()
  return (
    <MediaSlotList
      composerId={composerId}
      mediaSlots={mediaSlots}
      modelSpec={modelSpec}
      nodeType={nodeType}
      variant={variant}
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
  )
}

function ComposerPromptSection({
  currentValue,
  mode,
  nodeType,
  onExpand,
}: {
  currentValue: NodeTaskFormValue
  mode: 'collapsed' | 'expanded'
  nodeType: ReturnType<typeof useMediaTaskForm>['nodeType']
  onExpand?: (() => void) | undefined
}) {
  const m = useMessages()
  const { form } = useMediaTaskForm()
  if (mode === 'collapsed') {
    return (
      <form.AppField name="prompt">
        {(field) => (
          <div onFocusCapture={onExpand} onPointerDown={onExpand}>
            <field.TextField
              ariaLabel={m.workflow_canvas_prompt()}
              inputClassName={collapsedPromptInputClassName}
              placeholder={currentValue.kind === 'video_generation' ? m.workflow_canvas_prompt_placeholder_video() : m.workflow_canvas_prompt_placeholder_image()}
            />
          </div>
        )}
      </form.AppField>
    )
  }

  return (
    <section className="mina-wc-prompt-section relative min-w-0" aria-label={m.workflow_canvas_prompt()}>
      <form.AppField name="prompt">
        {(field) => (
          <field.TextField
            multiline
            placeholder={nodeType === 'video_generation' ? m.workflow_canvas_prompt_placeholder_video() : m.workflow_canvas_prompt_placeholder_image()}
            textareaClassName={composerPromptTextareaClassName}
          />
        )}
      </form.AppField>
    </section>
  )
}

function ComposerConfigSection({
  modelState,
  runError,
  running,
}: {
  modelState: ComposerModelState & { spec: ClientModelSpec }
  runError?: string | undefined
  running?: boolean | undefined
}) {
  const m = useMessages()
  const { composerId, form } = useMediaTaskForm()
  const advancedOpen = useCanvasUiStore((state) => state.advancedOpenByComposerId[composerId] ?? false)
  const setComposerAdvancedOpen = useCanvasUiStore((state) => state.setComposerAdvancedOpen)

  return (
    <section className={configSectionClassName} aria-label={m.workflow_canvas_model_configuration()}>
      <ModelConfigToolbar
        advancedOpen={advancedOpen}
        canSubmit={modelState.canSubmit}
        compatibilityMode={modelState.compatibilityMode}
        form={form}
        generationMode={modelState.generationMode}
        models={modelState.selectableModels}
        onModelChange={modelState.changeModel}
        onRun={() => {
          void form.handleSubmit()
        }}
        runError={runError}
        running={running}
        setAdvancedOpen={(open) => setComposerAdvancedOpen(composerId, open)}
        spec={modelState.spec}
      />

      {advancedOpen ? <AdvancedConfigGroup form={form} spec={modelState.spec} /> : null}
      {modelState.paramError ? <em className="mt-1 block text-[0.72rem] font-bold not-italic text-destructive">{modelState.paramError}</em> : null}

      <div className="flex min-h-0 items-center justify-end gap-1.5 text-[0.78rem] font-black text-foreground-quaternary">
        <Zap aria-hidden="true" size={13} />
        <span>14</span>
      </div>
    </section>
  )
}

export function MediaComposerShell({
  mode,
  modelScope = 'compatible-kind',
  onExpand,
  runError,
  running,
  submitDisabled,
}: MediaComposerShellProps) {
  const m = useMessages()
  const { form, mediaActions, nodeType } = useMediaTaskForm()
  const modelState = useComposerModel({ modelScope, submitDisabled })
  const { canSubmit, currentValue, generationMode, spec } = modelState

  if (!spec) {
    return (
      <div className="p-2.5 text-[0.74rem] font-bold text-foreground-quaternary">
        {m.workflow_canvas_no_models_available({ kind: currentValue.kind, mode: generationMode })}
      </div>
    )
  }

  if (mode === 'collapsed') {
    return (
      <section aria-label={m.workflow_canvas_draft_composer()} className={collapsedShellClassName}>
        <div className="relative min-w-0" onPointerDown={onExpand}>
          <ComposerMediaSection modelSpec={spec} onExpand={onExpand} variant="collapsed" />
        </div>
        <ComposerPromptSection currentValue={currentValue} mode="collapsed" nodeType={nodeType} onExpand={onExpand} />
        <button
          aria-label={m.workflow_canvas_run_prompt()}
          className={collapsedRunButtonClassName}
          disabled={!canSubmit || running}
          onClick={() => {
            void form.handleSubmit()
          }}
          title={mediaActions.uploading ? m.workflow_canvas_uploading() : m.workflow_canvas_run_prompt()}
          type="button"
        >
          <Zap aria-hidden="true" size={20} />
        </button>
        {runError ? <p className={emptyErrorClassName}>{runError}</p> : null}
      </section>
    )
  }

  return (
    <section aria-label={m.workflow_canvas_node_composer()} className={composerCardClassName}>
      <div className={composerBodyClassName}>
        <div className={attachmentLayerClassName}>
          <ComposerMediaSection modelSpec={spec} variant="attachment" />
        </div>
        <div className={composerPromptClassName}>
          <ComposerPromptSection currentValue={currentValue} mode="expanded" nodeType={nodeType} />
        </div>
      </div>

      <ComposerConfigSection modelState={{ ...modelState, spec }} runError={runError} running={running} />
    </section>
  )
}
