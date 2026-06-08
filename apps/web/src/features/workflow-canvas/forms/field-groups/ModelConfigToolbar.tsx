import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@mina/ui/components/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@mina/ui/components/popover'
import { BarChart2, ChevronDown, SlidersHorizontal } from 'lucide-react'

import { useMessages } from '../../../../app/i18n-provider'
import { RunControls } from '../../components/panels/RunControls'
import { AdvancedConfigGroup } from './AdvancedConfigGroup'
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
  submitLabel?: string | undefined
}

const modeLabel = (mode: GenerationMode, m: ReturnType<typeof useMessages>): string => {
  if (mode === 'i2i') {
    return m.workflow_canvas_mode_image_text_to_image()
  }
  if (mode === 't2v') {
    return m.workflow_canvas_mode_text_to_video()
  }
  if (mode === 'i2v') {
    return m.workflow_canvas_mode_image_text_to_video()
  }
  return m.workflow_canvas_mode_text_to_image()
}

const toolbarClassName = 'mina-wc-config-toolbar grid w-full min-w-0 grid-cols-[minmax(10rem,auto)_minmax(0,1fr)_auto] items-center gap-1 rounded-[18px] bg-surface-container-lowest p-1.5 text-foreground shadow-xl ring-1 ring-black/5 max-[760px]:grid-cols-1 max-[760px]:items-stretch dark:ring-white/5'
const modelGroupClassName = 'flex min-w-0 items-center'
const paramGroupClassName = 'flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
const actionGroupClassName = 'flex flex-none items-center gap-1 ml-auto max-[760px]:ml-0 max-[760px]:justify-start'
const eyebrowClassName = 'sr-only'
const modelRowClassName = 'flex min-w-0 items-center'
const modelTriggerClassName = 'group flex min-w-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[0.9rem] font-medium text-foreground transition-colors hover:bg-black/5 focus:outline-none dark:hover:bg-white/10'
const modelPopoverClassName = 'w-[320px] rounded-[16px] bg-surface-container-lowest p-1.5 text-foreground shadow-xl ring-1 ring-black/5 dark:ring-white/5'
const modeChipClassName = 'hidden'
const iconButtonClassName = 'flex items-center justify-center size-9 rounded-xl text-foreground-secondary hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors shadow-none data-[active=true]:bg-black/5 dark:data-[active=true]:bg-white/10'
const advancedPopoverClassName = 'nodrag nowheel nopan w-[min(720px,calc(100vw_-_32px))] rounded-[20px] border-0 bg-surface-container-lowest p-3 text-foreground shadow-2xl ring-1 ring-black/5 dark:ring-white/5'

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
  submitLabel,
}: ModelConfigToolbarProps) {
  const m = useMessages()
  const registry = useClientModelRegistry()
  const compatible = models ?? registry.listModels(spec.key.kind, compatibilityMode)

  return (
    <div className={toolbarClassName}>
      <div className={modelGroupClassName}>
        <span className={eyebrowClassName}>{m.workflow_canvas_model()}</span>
        <div className={modelRowClassName}>
          <DropdownMenu>
            <DropdownMenuTrigger className={modelTriggerClassName}>
              <BarChart2 className="size-4 text-foreground-secondary" />
              <span>{spec.displayName}</span>
              <ChevronDown className="size-3.5 text-foreground-tertiary" />
            </DropdownMenuTrigger>
            <DropdownMenuContent className={modelPopoverClassName} align="start" sideOffset={12}>
              {compatible.length ? (
                compatible.map((modelSpec) => (
                  <DropdownMenuItem
                    key={modelKey(modelSpec.key)}
                    className="flex items-center p-3 rounded-[12px] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer mb-0.5 last:mb-0"
                    onClick={() => onModelChange(modelSpec)}
                  >
                    <div className="flex items-center justify-center size-8 rounded-lg bg-black/5 dark:bg-white/10 mr-3">
                      <BarChart2 className="size-4 text-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[0.95rem] font-medium text-foreground">{modelSpec.displayName}</div>
                      <div className="text-[0.7rem] font-medium text-foreground-tertiary uppercase tracking-wider mt-0.5">
                        {modelSpec.key.provider}
                      </div>
                    </div>
                  </DropdownMenuItem>
                ))
              ) : (
                <div className="p-3 text-sm text-foreground-secondary">{m.workflow_canvas_no_compatible_models()}</div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <span className={modeChipClassName}>{modeLabel(generationMode, m)}</span>
        </div>
      </div>

      <div className={paramGroupClassName}>
        {spec.BasicFields ? <spec.BasicFields fields="params" form={form} /> : null}
      </div>

      <div className={actionGroupClassName}>
        <Popover open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <PopoverTrigger asChild>
            <button
              className={iconButtonClassName}
              data-active={advancedOpen ? 'true' : undefined}
              type="button"
              title={m.workflow_canvas_advanced_settings()}
              aria-label={m.workflow_canvas_advanced_settings()}
            >
              <SlidersHorizontal className="size-[1.1rem]" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className={advancedPopoverClassName}
            data-mina-canvas-ignore="true"
            side="top"
            sideOffset={16}
          >
            <AdvancedConfigGroup form={form} spec={spec} />
          </PopoverContent>
        </Popover>
        <RunControls compact disabled={!canSubmit} error={runError} label={submitLabel} onRun={onRun} running={running} />
      </div>
    </div>
  )
}
