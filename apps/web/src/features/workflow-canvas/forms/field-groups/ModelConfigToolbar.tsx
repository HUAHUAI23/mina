import { Camera, ChevronDown, Image as ImageIcon, Languages, SlidersHorizontal, Sparkles } from 'lucide-react'
import type { TaskModelDescriptor, TaskModelField } from '@mina/contracts/modules/tasks/model-catalog'

import {
  compatibleModels,
  modelKey,
  paramsForModel,
} from '../model-form-utils'
import { RunControls } from '../../components/panels/RunControls'
import type { NodeTaskFormValue, TaskParamValue, TaskParams } from '../model-form-utils'

interface ModelConfigToolbarProps {
  advancedOpen: boolean
  canSubmit: boolean
  models: TaskModelDescriptor[]
  value: NodeTaskFormValue
  onModelChange(provider: string, model: string, params: TaskParams): void
  onParamsChange(params: TaskParams): void
  onRun(): void
  runError?: string | undefined
  running?: boolean | undefined
  setAdvancedOpen(open: boolean): void
}

const isNumericField = (field: TaskModelField): boolean =>
  field.kind === 'integer' || field.kind === 'number' || field.kind === 'slider'

const fieldIcon = (field: TaskModelField) => {
  if (field.key === 'aspectRatio' || field.key === 'ratio' || field.key === 'size' || field.key === 'imageSize') {
    return ImageIcon
  }
  if (field.key === 'count' || field.key === 'durationSeconds') {
    return field.key === 'count' ? Sparkles : Camera
  }
  return SlidersHorizontal
}

const stringValue = (value: TaskParamValue | undefined): string =>
  value === undefined || value === null ? '' : String(value)

const parseFieldValue = (field: TaskModelField, value: string): TaskParamValue => {
  if (isNumericField(field)) {
    return Number(value)
  }
  return value
}

export function ModelConfigToolbar({
  advancedOpen,
  canSubmit,
  models,
  onModelChange,
  onParamsChange,
  onRun,
  runError,
  running,
  setAdvancedOpen,
  value,
}: ModelConfigToolbarProps) {
  const compatible = compatibleModels(models, value.kind)
  const activeModel = compatible.find(
    (model) => model.provider === value.provider && model.model === value.model,
  )
  const basicFields = (activeModel?.fields ?? []).filter((field) => field.section === 'basic')

  return (
    <div className="mina-wc-config-toolbar">
      <label className="mina-wc-toolbar-select mina-wc-model-select">
        <Sparkles aria-hidden="true" size={16} />
        <select
          value={modelKey({ provider: value.provider, model: value.model })}
          onChange={(event) => {
            const selected = compatible.find((model) => modelKey(model) === event.target.value)
            if (!selected) {
              return
            }
            onModelChange(selected.provider, selected.model, paramsForModel(value.params, selected))
          }}
        >
          {compatible.map((model) => (
            <option key={modelKey(model)} value={modelKey(model)}>
              {model.displayName}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" size={14} />
      </label>

      {basicFields.map((modelField) => {
        const Icon = fieldIcon(modelField)
        return (
          <label className="mina-wc-toolbar-select" key={modelField.key}>
            <Icon aria-hidden="true" size={16} />
            {modelField.kind === 'select' && modelField.options?.length ? (
              <select
                aria-label={modelField.label}
                value={stringValue(value.params[modelField.key] ?? modelField.defaultValue)}
                onChange={(event) => {
                  onParamsChange({ ...value.params, [modelField.key]: event.target.value })
                }}
              >
                {modelField.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                aria-label={modelField.label}
                min={modelField.min}
                max={modelField.max}
                step={modelField.step}
                type={isNumericField(modelField) ? 'number' : 'text'}
                value={stringValue(value.params[modelField.key] ?? modelField.defaultValue)}
                onChange={(event) => {
                  onParamsChange({
                    ...value.params,
                    [modelField.key]: parseFieldValue(modelField, event.target.value),
                  })
                }}
              />
            )}
            {modelField.kind === 'select' ? <ChevronDown aria-hidden="true" size={14} /> : null}
          </label>
        )
      })}

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

export { isNumericField, parseFieldValue, stringValue }
