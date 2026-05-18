import type { TaskModelDescriptor } from '@mina/contracts/modules/tasks/model-catalog'
import type { TaskDraftConfig } from '@mina/contracts/modules/tasks'

interface ProviderModelSectionProps {
  models: TaskModelDescriptor[]
  onChange(task: TaskDraftConfig): void
  task: TaskDraftConfig
}

export function ProviderModelSection({ models, onChange, task }: ProviderModelSectionProps) {
  const compatible = models.filter((model) => model.kind === task.kind)
  return (
    <div className="mina-wc-model-grid">
      <label className="mina-wc-field">
        <span>Model</span>
        <select
          value={`${task.provider}:${task.model}`}
          onChange={(event) => {
            const selected = compatible.find((model) => `${model.provider}:${model.model}` === event.target.value)
            if (selected) {
              onChange({ ...task, provider: selected.provider, model: selected.model, params: selected.defaults })
            }
          }}
        >
          {compatible.map((model) => (
            <option key={`${model.provider}:${model.model}`} value={`${model.provider}:${model.model}`}>
              {model.displayName}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
