import { ChevronDown, Languages, SlidersHorizontal, Sparkles, type LucideIcon } from 'lucide-react'
import { cn } from '@mina/ui/lib/utils'

import { useMessages } from '../../../../app/i18n-provider'
import { RunControls } from '../../components/panels/RunControls'
import {
  modelKey,
  useClientModelRegistry,
  type ClientModelSpec,
  type GenerationMode,
  type ModelCompatibilityMode,
} from '../registry/client-model-registry'
import type { NodeTaskFormApi } from '../form-context'

interface ModelConfigToolbarProps {
  advancedOpen: boolean
  canSubmit: boolean
  compatibilityMode: ModelCompatibilityMode
  form: NodeTaskFormApi
  generationMode: GenerationMode
  runIcon?: LucideIcon | undefined
  models?: ClientModelSpec[] | undefined
  onModelChange(spec: ClientModelSpec): void
  onRun(): void
  runError?: string | undefined
  running?: boolean | undefined
  setAdvancedOpen(open: boolean): void
  spec: ClientModelSpec
  submitLabel?: string | undefined
}

const modeLabel = (mode: GenerationMode, m: ReturnType<typeof useMessages>): string => {
  if (mode === 'i2i') {
    return m.workflow_canvas_mode_image_text_to_image()
  }
  if (mode === 't2v') {
    return m.workflow_canvas_mode_text_to_video()
  }
  if (mode === 'i2v') {
    return m.workflow_canvas_mode_image_text_to_video()
  }
  return m.workflow_canvas_mode_text_to_image()
}

const toolbarClassName = 'mina-wc-config-toolbar flex min-h-[54px] min-w-0 items-center gap-2.5 overflow-x-auto pr-[66px] max-[720px]:gap-2'
const modeChipClassName = 'inline-flex min-h-7 flex-none items-center rounded-full bg-surface-container-high px-2.5 text-[0.68rem] font-[850] text-foreground-tertiary'
const iconToggleClassName = 'flex size-10.5 items-center justify-center rounded-lg border-0 bg-transparent text-foreground-tertiary hover:bg-surface-container-low hover:text-foreground data-[active=true]:bg-surface-container-low data-[active=true]:text-foreground'

export function ModelConfigToolbar({
  advancedOpen,
  canSubmit,
  compatibilityMode,
  form,
  generationMode,
  runIcon,
  models,
  onModelChange,
  onRun,
  runError,
  running,
  setAdvancedOpen,
  spec,
  submitLabel,
}: ModelConfigToolbarProps) {
  const m = useMessages()
  const registry = useClientModelRegistry()
  const compatible = models ?? registry.listModels(spec.key.kind, compatibilityMode)
  const value = modelKey(spec.key)

  return (
    <div className={toolbarClassName}>
      <label className="inline-flex max-w-60 min-w-0 flex-none items-center gap-[7px] text-foreground">
        <Sparkles aria-hidden="true" size={16} />
        <select
          aria-label={m.workflow_canvas_model()}
          className="min-h-10 min-w-0 appearance-none border-0 bg-transparent text-sm font-bold text-foreground outline-0"
          value={value}
          onChange={(event) => {
            const selected = compatible.find((candidate) => modelKey(candidate.key) === event.target.value)
            if (selected) {
              onModelChange(selected)
            }
          }}
        >
          {compatible.length ? (
            compatible.map((modelSpec) => (
              <option key={modelKey(modelSpec.key)} value={modelKey(modelSpec.key)}>
                {modelSpec.displayName}
              </option>
            ))
          ) : (
            <option disabled>{m.workflow_canvas_no_compatible_models()}</option>
          )}
        </select>
        <ChevronDown aria-hidden="true" size={14} />
      </label>

      <span className={modeChipClassName}>{modeLabel(generationMode, m)}</span>

      {spec.BasicFields ? <spec.BasicFields fields="params" form={form} /> : null}

      <button className={cn(iconToggleClassName, 'ml-auto')} type="button" title={m.workflow_canvas_language_tools()} aria-label={m.workflow_canvas_language_tools()}>
        <Languages aria-hidden="true" size={17} />
      </button>
      <button
        className={iconToggleClassName}
        data-active={advancedOpen ? 'true' : undefined}
        type="button"
        title={m.workflow_canvas_advanced_settings()}
        aria-label={m.workflow_canvas_advanced_settings()}
        onClick={() => setAdvancedOpen(!advancedOpen)}
      >
        <SlidersHorizontal aria-hidden="true" size={17} />
      </button>
      <RunControls compact disabled={!canSubmit} error={runError} icon={runIcon} label={submitLabel} onRun={onRun} running={running} />
    </div>
  )
}
