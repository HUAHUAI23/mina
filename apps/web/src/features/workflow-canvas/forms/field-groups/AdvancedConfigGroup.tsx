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
    <div className="grid max-h-[min(50dvh,360px)] min-h-0 gap-3 overflow-y-auto bg-transparent [scrollbar-gutter:stable]">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-3">
        <spec.AdvancedFields fields="params" form={form} />
      </div>
    </div>
  )
}
