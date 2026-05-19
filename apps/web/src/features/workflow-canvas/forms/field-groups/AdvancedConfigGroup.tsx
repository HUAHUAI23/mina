import type { TaskModelField } from '@mina/contracts/modules/tasks/model-catalog'

import type { TaskParams } from '../model-form-utils'
import { isNumericField, parseFieldValue, stringValue } from './ModelConfigToolbar'

interface AdvancedConfigGroupProps {
  fields: TaskModelField[]
  onParamsChange(params: TaskParams): void
  params: TaskParams
}

export function AdvancedConfigGroup({ fields, onParamsChange, params }: AdvancedConfigGroupProps) {
  return (
    <div className="mina-wc-advanced-body">
      {fields.length > 0 ? (
        fields.map((modelField) => (
          <div key={modelField.key}>
            {(() => {
              const fieldValue = params[modelField.key] ?? modelField.defaultValue
              if (modelField.kind === 'boolean') {
                return (
                  <label className="mina-wc-switch-field">
                    <span>{modelField.label}</span>
                    <input
                      checked={Boolean(fieldValue)}
                      type="checkbox"
                      onChange={(event) => onParamsChange({ ...params, [modelField.key]: event.target.checked })}
                    />
                  </label>
                )
              }
              return (
                <label className="mina-wc-field">
                  <span>{modelField.label}</span>
                  {modelField.kind === 'select' && modelField.options?.length ? (
                    <select
                      value={stringValue(fieldValue)}
                      onChange={(event) => onParamsChange({ ...params, [modelField.key]: event.target.value })}
                    >
                      {modelField.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      min={modelField.min}
                      max={modelField.max}
                      step={modelField.step}
                      type={isNumericField(modelField) ? 'number' : 'text'}
                      value={stringValue(fieldValue)}
                      onChange={(event) =>
                        onParamsChange({
                          ...params,
                          [modelField.key]: parseFieldValue(modelField, event.target.value),
                        })
                      }
                    />
                  )}
                </label>
              )
            })()}
          </div>
        ))
      ) : (
        <div className="mina-wc-panel-empty">No advanced fields for this model</div>
      )}
    </div>
  )
}
