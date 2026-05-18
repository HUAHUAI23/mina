import type { TaskModelDescriptor } from '@mina/contracts/modules/tasks/model-catalog'
import type { TaskDraftConfig } from '@mina/contracts/modules/tasks'

interface AdvancedSettingsPanelProps {
  model?: TaskModelDescriptor | undefined
  onChange(task: TaskDraftConfig): void
  task: TaskDraftConfig
}

export function AdvancedSettingsPanel({ model, onChange, task }: AdvancedSettingsPanelProps) {
  const fields = model?.fields ?? []
  if (fields.length === 0) {
    return null
  }
  return (
    <div className="mina-wc-advanced">
      {fields.map((field) => {
        const value = task.params[field.key] ?? field.defaultValue ?? ''
        if (field.kind === 'boolean') {
          return (
            <label className="mina-wc-check-field" key={field.key}>
              <input
                checked={Boolean(value)}
                type="checkbox"
                onChange={(event) => onChange({ ...task, params: { ...task.params, [field.key]: event.target.checked } })}
              />
              <span>{field.label}</span>
            </label>
          )
        }
        if (field.kind === 'select' && field.options?.length) {
          return (
            <label className="mina-wc-field" key={field.key}>
              <span>{field.label}</span>
              <select
                value={String(value)}
                onChange={(event) => onChange({ ...task, params: { ...task.params, [field.key]: event.target.value } })}
              >
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )
        }
        return (
          <label className="mina-wc-field" key={field.key}>
            <span>{field.label}</span>
            <input
              min={field.min}
              max={field.max}
              step={field.step}
              type={field.kind === 'integer' || field.kind === 'number' || field.kind === 'slider' ? 'number' : 'text'}
              value={String(value)}
              onChange={(event) => {
                const nextValue =
                  field.kind === 'integer' || field.kind === 'number' || field.kind === 'slider'
                    ? Number(event.target.value)
                    : event.target.value
                onChange({ ...task, params: { ...task.params, [field.key]: nextValue } })
              }}
            />
          </label>
        )
      })}
    </div>
  )
}
