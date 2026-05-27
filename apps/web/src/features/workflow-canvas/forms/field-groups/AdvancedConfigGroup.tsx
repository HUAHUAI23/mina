import { useMessages } from '../../../../app/i18n-provider'
import type { ClientModelSpec } from '../registry/client-model-registry'
import type { NodeTaskFormApi } from '../form-context'

interface AdvancedConfigGroupProps {
  form: NodeTaskFormApi
  spec: ClientModelSpec
}

export function AdvancedConfigGroup({ form, spec }: AdvancedConfigGroupProps) {
  const m = useMessages()

  if (!spec.AdvancedFields) {
    return <div className="p-2.5 text-[0.74rem] font-bold text-foreground-quaternary">{m.workflow_canvas_no_advanced_fields()}</div>
  }

  return (
    <div className="grid gap-3 rounded-xl bg-surface-container-lowest/55 p-3.5">
      <spec.AdvancedFields fields="params" form={form} />
    </div>
  )
}
