import type { ClientModelSpec } from '../registry/client-model-registry'
import type { NodeTaskFormApi } from '../form-context'

interface AdvancedConfigGroupProps {
  form: NodeTaskFormApi
  spec: ClientModelSpec
}

export function AdvancedConfigGroup({ form, spec }: AdvancedConfigGroupProps) {
  if (!spec.AdvancedFields) {
    return <div className="p-2.5 text-[0.74rem] font-bold text-foreground-quaternary">No advanced fields for this model</div>
  }

  return (
    <div className="grid gap-3 rounded-xl bg-surface-container-lowest/55 p-3.5">
      <spec.AdvancedFields fields="params" form={form} />
    </div>
  )
}
