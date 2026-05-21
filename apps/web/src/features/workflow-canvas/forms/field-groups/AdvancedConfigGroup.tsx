import type { ClientModelSpec } from '../registry'
import type { NodeTaskFormApi } from '../form-context'

interface AdvancedConfigGroupProps {
  form: NodeTaskFormApi
  spec: ClientModelSpec
}

export function AdvancedConfigGroup({ form, spec }: AdvancedConfigGroupProps) {
  if (!spec.AdvancedFields) {
    return <div className="mina-wc-panel-empty">No advanced fields for this model</div>
  }

  return (
    <div className="mina-wc-advanced-body">
      <spec.AdvancedFields form={form} />
    </div>
  )
}
