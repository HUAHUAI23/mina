import { ChevronDown, Languages, SlidersHorizontal, Sparkles } from 'lucide-react'

import { RunControls } from '../../components/panels/RunControls'
import {
  listClientModels,
  modelSelectValue,
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

export function ModelConfigToolbar({
  advancedOpen,
  canSubmit,
  compatibilityMode,
  form,
  generationMode,
  onModelChange,
  onRun,
  runError,
  running,
  setAdvancedOpen,
  spec,
}: ModelConfigToolbarProps) {
  const compatible = listClientModels(spec.key.kind, compatibilityMode)
  const value = modelSelectValue(spec.key)

  return (
    <div className="mina-wc-config-toolbar">
      <label className="mina-wc-toolbar-select mina-wc-model-select">
        <Sparkles aria-hidden="true" size={16} />
        <select
          aria-label="Model"
          value={value}
          onChange={(event) => {
            const selected = compatible.find((candidate) => modelSelectValue(candidate.key) === event.target.value)
            if (selected) {
              onModelChange(selected)
            }
          }}
        >
          {compatible.length ? (
            compatible.map((modelSpec) => (
              <option key={modelSelectValue(modelSpec.key)} value={modelSelectValue(modelSpec.key)}>
                {modelSpec.displayName}
              </option>
            ))
          ) : (
            <option disabled>No compatible models</option>
          )}
        </select>
        <ChevronDown aria-hidden="true" size={14} />
      </label>

      <span className="mina-wc-mode-chip">{modeLabel(generationMode)}</span>

      {spec.BasicFields ? <spec.BasicFields form={form} /> : null}

      <button className="mina-wc-icon-toggle mina-wc-language-toggle" type="button" title="Language tools" aria-label="Language tools">
        <Languages aria-hidden="true" size={17} />
      </button>
      <button
        className="mina-wc-icon-toggle"
        data-active={advancedOpen ? 'true' : undefined}
        type="button"
        title="Advanced settings"
        aria-label="Advanced settings"
        onClick={() => setAdvancedOpen(!advancedOpen)}
      >
        <SlidersHorizontal aria-hidden="true" size={17} />
      </button>
      <RunControls disabled={!canSubmit} onRun={onRun} running={running} error={runError} />
    </div>
  )
}
