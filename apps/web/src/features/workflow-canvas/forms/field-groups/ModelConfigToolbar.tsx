import { ChevronDown, Languages, SlidersHorizontal, Sparkles } from 'lucide-react'

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
  models?: ClientModelSpec[] | undefined
  onModelChange(spec: ClientModelSpec): void
  onRun(): void
  runError?: string | undefined
  running?: boolean | undefined
  setAdvancedOpen(open: boolean): void
  spec: ClientModelSpec
}

const modeLabel = (mode: GenerationMode): string => {
  if (mode === 'i2i') {
    return 'Image + Text to Image'
  }
  if (mode === 't2v') {
    return 'Text to Video'
  }
  if (mode === 'i2v') {
    return 'Image + Text to Video'
  }
  return 'Text to Image'
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
  models,
  onModelChange,
  onRun,
  runError,
  running,
  setAdvancedOpen,
  spec,
}: ModelConfigToolbarProps) {
  const registry = useClientModelRegistry()
  const compatible = models ?? registry.listModels(spec.key.kind, compatibilityMode)
  const value = modelKey(spec.key)

  return (
    <div className={toolbarClassName}>
      <label className="inline-flex max-w-60 min-w-0 flex-none items-center gap-[7px] text-foreground">
        <Sparkles aria-hidden="true" size={16} />
        <select
          aria-label="Model"
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
            <option disabled>No compatible models</option>
          )}
        </select>
        <ChevronDown aria-hidden="true" size={14} />
      </label>

      <span className={modeChipClassName}>{modeLabel(generationMode)}</span>

      {spec.BasicFields ? <spec.BasicFields fields="params" form={form} /> : null}

      <button className={`${iconToggleClassName} ml-auto`} type="button" title="Language tools" aria-label="Language tools">
        <Languages aria-hidden="true" size={17} />
      </button>
      <button
        className={iconToggleClassName}
        data-active={advancedOpen ? 'true' : undefined}
        type="button"
        title="Advanced settings"
        aria-label="Advanced settings"
        onClick={() => setAdvancedOpen(!advancedOpen)}
      >
        <SlidersHorizontal aria-hidden="true" size={17} />
      </button>
      <RunControls compact disabled={!canSubmit} onRun={onRun} running={running} error={runError} />
    </div>
  )
}
