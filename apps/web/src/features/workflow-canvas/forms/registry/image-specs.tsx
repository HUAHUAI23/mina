import {
  GOOGLE_IMAGE_ASPECT_RATIOS,
  GOOGLE_IMAGE_PRO_ASPECT_RATIOS,
  GOOGLE_IMAGE_PRO_SIZES,
  GOOGLE_IMAGE_SIZES,
  GoogleGeminiImageParamsSchema,
  VOLCENGINE_SEEDREAM_4_5_SIZES,
  VOLCENGINE_SEEDREAM_5_SIZES,
  VolcengineSeedreamParamsSchema,
  type GoogleGeminiImageParams,
  type VolcengineSeedreamParams,
} from '@mina/contracts/modules/tasks/image-model-params'

import { useEffect, useRef, useState } from 'react'
import { Monitor, Square, RectangleHorizontal, RectangleVertical, ChevronDown, Check } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@mina/ui/components/popover'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@mina/ui/components/dropdown-menu'
import { cn } from '@mina/ui/lib/utils'

import { useMessages } from '../../../../app/i18n-provider'
import type { ClientModelSpec } from './client-model-registry'
import { withNodeTaskFieldGroup } from '../form-context'

const option = (value: string) => ({ label: value, value })

const googleAspectRatioOptions = GOOGLE_IMAGE_ASPECT_RATIOS.map(option)
const googleProAspectRatioOptions = GOOGLE_IMAGE_PRO_ASPECT_RATIOS.map(option)
const googleSizeOptions = GOOGLE_IMAGE_SIZES.map(option)
const googleProSizeOptions = GOOGLE_IMAGE_PRO_SIZES.map(option)
const seedream5SizeOptions = VOLCENGINE_SEEDREAM_5_SIZES.map(option)
const seedream45SizeOptions = VOLCENGINE_SEEDREAM_4_5_SIZES.map(option)

type SelectOption = { label: string; value: string }

function getRatioIcon(ratio: string) {
  if (ratio === '1:1') return <Square className="size-4" />
  if (ratio === '16:9' || ratio === '21:9' || ratio === '3:2') return <RectangleHorizontal className="size-4" />
  if (ratio === '9:16' || ratio === '9:21' || ratio === '2:3' || ratio === '3:4') return <RectangleVertical className="size-4" />
  return <Monitor className="size-4" />
}

const popoverTriggerClassName = 'group flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[0.88rem] font-medium text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors focus:outline-none'
const popoverContentClassName = 'w-[340px] rounded-[20px] bg-surface-container-lowest p-4 text-foreground shadow-2xl ring-1 ring-black/5 dark:ring-white/5'
const gridButtonClassName = 'flex flex-col items-center justify-center gap-1.5 rounded-[12px] border border-border bg-transparent p-2 hover:bg-accent hover:text-accent-foreground transition-all data-[active=true]:bg-accent data-[active=true]:border-accent-foreground/20 data-[active=true]:text-foreground'
const countOptions = [1, 2, 4] as const
const countCustomMin = 1
const countCustomMax = 16
const countMenuContentClassName = 'min-w-[80px] rounded-[16px] bg-surface-container-lowest p-1.5 text-foreground shadow-xl ring-1 ring-black/5 dark:ring-white/5'
const countMenuItemClassName = 'flex items-center justify-center p-2.5 rounded-[12px] text-[0.85rem] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer mb-0.5 last:mb-0 relative'
const countInputClassName = 'w-full min-w-0 cursor-text bg-transparent px-4 text-center text-[0.85rem] text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'

function CountDropdownField({
  ariaLabel,
  onChange,
  value,
}: {
  ariaLabel: string
  onChange(value: number): void
  value: unknown
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [dirty, setDirty] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const numericValue = typeof value === 'number' && Number.isFinite(value) ? value : countOptions[0]
  const presetValues = countOptions.slice(1)
  const customRowSelected = !presetValues.includes(numericValue as never)
  const customDisplayValue = customRowSelected ? numericValue : countOptions[0]

  useEffect(() => {
    if (!open) {
      return
    }
    setDraft(String(customDisplayValue))
    setDirty(false)
  }, [customDisplayValue, open])

  const commitDraft = (force = false) => {
    if (!force && !dirty) {
      return
    }
    const parsed = Number.parseInt(draft, 10)
    if (!Number.isFinite(parsed)) {
      setDraft(String(customDisplayValue))
      setDirty(false)
      return
    }
    const nextValue = Math.min(Math.max(parsed, countCustomMin), countCustomMax)
    onChange(nextValue)
    setDraft(String(nextValue))
    setDirty(false)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger className={popoverTriggerClassName} aria-label={ariaLabel}>
        <span className="min-w-[1ch] text-center">{numericValue}</span>
        <ChevronDown className="size-3.5 text-foreground-tertiary" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className={countMenuContentClassName} align="center" sideOffset={12}>
        <div
          className={countMenuItemClassName}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <input
            aria-label={ariaLabel}
            className={countInputClassName}
            inputMode="numeric"
            max={countCustomMax}
            min={countCustomMin}
            onBlur={() => commitDraft()}
            onChange={(event) => {
              setDraft(event.target.value)
              setDirty(true)
            }}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Enter') {
                event.preventDefault()
                commitDraft(true)
                setOpen(false)
              }
              if (event.key === 'Escape') {
                setDraft(String(customDisplayValue))
                setDirty(false)
                setOpen(false)
              }
            }}
            ref={inputRef}
            step={1}
            type="number"
            value={draft}
          />
          {customRowSelected ? <Check className="absolute right-2 size-3" /> : null}
        </div>
        {presetValues.map((opt) => (
          <DropdownMenuItem
            key={opt}
            className={countMenuItemClassName}
            onClick={() => onChange(opt)}
          >
            <span>{opt}</span>
            {numericValue === opt ? <Check className="absolute right-2 size-3" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const GeminiBasicFields = withNodeTaskFieldGroup<Partial<GoogleGeminiImageParams>, unknown, {
  aspectRatioOptions?: SelectOption[]
  imageSizeOptions?: SelectOption[]
}>({
  defaultValues: {},
  render: ({
    group,
    imageSizeOptions = googleSizeOptions,
    aspectRatioOptions = googleAspectRatioOptions,
  }) => {
    const m = useMessages()
    return (
      <>
        <group.AppField name="aspectRatio">
          {(ratioField) => (
            <group.AppField name="imageSize">
              {(sizeField) => (
                <Popover>
                  <PopoverTrigger className={popoverTriggerClassName}>
                    <Monitor className="size-4 text-foreground-secondary" />
                    <span>{ratioField.state.value} · {sizeField.state.value}</span>
                    <ChevronDown className="size-3.5 text-foreground-tertiary" />
                  </PopoverTrigger>
                  <PopoverContent className={popoverContentClassName} align="start" sideOffset={12}>
                    <div className="mb-2 text-[0.75rem] font-medium text-foreground-secondary">{m.workflow_canvas_image_size()}</div>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      {imageSizeOptions.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className={cn('py-1.5 rounded-[10px] border text-[0.85rem] transition-all', sizeField.state.value === opt.value ? 'bg-accent border-accent-foreground/20 text-foreground' : 'border-border bg-transparent text-foreground-secondary hover:bg-accent hover:text-accent-foreground')}
                          onClick={() => sizeField.handleChange(opt.value as never)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <div className="mb-2 text-[0.75rem] font-medium text-foreground-secondary">{m.workflow_canvas_aspect_ratio()}</div>
                    <div className="grid grid-cols-4 gap-2">
                      {aspectRatioOptions.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className={gridButtonClassName}
                          data-active={ratioField.state.value === opt.value ? 'true' : undefined}
                          onClick={() => ratioField.handleChange(opt.value as never)}
                        >
                          {getRatioIcon(opt.value)}
                          <span className="text-[0.7rem]">{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </group.AppField>
          )}
        </group.AppField>
        <group.AppField name="count">
          {(field) => (
            <CountDropdownField
              ariaLabel={m.workflow_canvas_count()}
              onChange={(nextValue) => field.handleChange(nextValue as never)}
              value={field.state.value}
            />
          )}
        </group.AppField>
      </>
    )
  },
})

const GeminiAdvancedFields = withNodeTaskFieldGroup<Partial<GoogleGeminiImageParams>, unknown>({
  defaultValues: {},
  render: ({ group }) => {
    const m = useMessages()
    return (
      <>
        <group.AppField name="imageSearch">
          {(field) => <field.SwitchField label={m.workflow_canvas_image_search_grounding()} />}
        </group.AppField>
        <group.AppField name="webSearch">
          {(field) => <field.SwitchField label={m.workflow_canvas_web_search_grounding()} />}
        </group.AppField>
        <group.AppField name="includeThoughts">
          {(field) => <field.SwitchField label={m.workflow_canvas_include_thoughts()} />}
        </group.AppField>
        <group.AppField name="thinkingLevel">
          {(field) => (
            <field.SelectField
              label={m.workflow_canvas_thinking_level()}
              options={[
                { label: m.workflow_canvas_option_default(), value: '' },
                { label: m.workflow_canvas_option_minimal(), value: 'minimal' },
                { label: m.workflow_canvas_option_high(), value: 'high' },
              ]}
            />
          )}
        </group.AppField>
      </>
    )
  },
})

const GeminiProAdvancedFields = withNodeTaskFieldGroup<Partial<GoogleGeminiImageParams>, unknown>({
  defaultValues: {},
  render: ({ group }) => {
    const m = useMessages()
    return (
      <>
        <group.AppField name="webSearch">
          {(field) => <field.SwitchField label={m.workflow_canvas_web_search_grounding()} />}
        </group.AppField>
      </>
    )
  },
})

const SeedreamBasicFields = withNodeTaskFieldGroup<Partial<VolcengineSeedreamParams>, unknown, {
  sizeOptions: SelectOption[]
}>({
  defaultValues: {},
  render: ({ group, sizeOptions }) => {
    const m = useMessages()
    return (
      <>
        <group.AppField name="size">
          {(sizeField) => (
            <Popover>
              <PopoverTrigger className={popoverTriggerClassName}>
                <Monitor className="size-4 text-foreground-secondary" />
                <span>{sizeField.state.value}</span>
                <ChevronDown className="size-3.5 text-foreground-tertiary" />
              </PopoverTrigger>
              <PopoverContent className={popoverContentClassName} align="start" sideOffset={12}>
                <div className="mb-2 text-[0.75rem] font-medium text-foreground-secondary">{m.workflow_canvas_image_size()}</div>
                <div className="grid grid-cols-2 gap-2">
                  {sizeOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={cn('py-1.5 rounded-[10px] border text-[0.85rem] transition-all', sizeField.state.value === opt.value ? 'bg-accent border-accent-foreground/20 text-foreground' : 'border-border bg-transparent text-foreground-secondary hover:bg-accent hover:text-accent-foreground')}
                      onClick={() => sizeField.handleChange(opt.value as never)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </group.AppField>
        <group.AppField name="count">
          {(field) => (
            <CountDropdownField
              ariaLabel={m.workflow_canvas_count()}
              onChange={(nextValue) => field.handleChange(nextValue as never)}
              value={field.state.value}
            />
          )}
        </group.AppField>
      </>
    )
  },
})

const SeedreamAdvancedFields = withNodeTaskFieldGroup<Partial<VolcengineSeedreamParams>, unknown, {
  supportsPng: boolean
  supportsWebSearch: boolean
}>({
  defaultValues: {},
  render: ({ group, supportsPng, supportsWebSearch }) => {
    const m = useMessages()
    return (
      <>
        <group.AppField name="optimizePrompt">
          {(field) => <field.SwitchField label={m.workflow_canvas_optimize_prompt()} />}
        </group.AppField>
        <group.AppField name="outputFormat">
          {(field) => (
            <field.SelectField
              label={m.workflow_canvas_output_format()}
              options={[
                { label: m.workflow_canvas_option_default(), value: '' },
                ...(supportsPng ? [{ label: 'PNG', value: 'png' }] : []),
                { label: 'JPEG', value: 'jpeg' },
              ]}
            />
          )}
        </group.AppField>
        <group.AppField name="sequentialImageGeneration">
          {(field) => (
            <field.SelectField
              label={m.workflow_canvas_sequential_generation()}
              options={[
                { label: m.workflow_canvas_option_default(), value: '' },
                { label: m.workflow_canvas_option_auto(), value: 'auto' },
                { label: m.workflow_canvas_option_disabled(), value: 'disabled' },
              ]}
            />
          )}
        </group.AppField>
        <group.AppField name="maxImages">
          {(field) => <field.NumberField label={m.workflow_canvas_max_images()} max={16} min={1} step={1} />}
        </group.AppField>
        <group.AppField name="watermark">
          {(field) => <field.SwitchField label={m.workflow_canvas_watermark()} />}
        </group.AppField>
        {supportsWebSearch ? (
          <group.AppField name="webSearch">
            {(field) => <field.SwitchField label={m.workflow_canvas_web_search()} />}
          </group.AppField>
        ) : null}
      </>
    )
  },
})

export const imageClientModelSpecs: ClientModelSpec[] = [
  {
    AdvancedFields: GeminiAdvancedFields,
    BasicFields: GeminiBasicFields,
    defaults: {
      aspectRatio: '1:1',
      count: 1,
      imageSearch: false,
      imageSize: '1K',
      includeThoughts: false,
      webSearch: false,
    },
    displayName: 'Gemini 3.1 Flash Image',
    key: { kind: 'image_generation', provider: 'google', model: 'gemini-3.1-flash-image-preview' },
    mediaCapabilities: { inputImages: { max: 14 } },
    paramsSchema: GoogleGeminiImageParamsSchema,
    supportsMedia: true,
    supportsText: true,
  },
  {
    AdvancedFields: GeminiProAdvancedFields,
    BasicFields: ({ fields, form }) => (
      <GeminiBasicFields
        fields={fields}
        form={form}
        aspectRatioOptions={googleProAspectRatioOptions}
        imageSizeOptions={googleProSizeOptions}
      />
    ),
    defaults: {
      aspectRatio: '1:1',
      count: 1,
      imageSearch: false,
      imageSize: '1K',
      includeThoughts: false,
      webSearch: false,
    },
    displayName: 'Gemini 3 Pro Image',
    key: { kind: 'image_generation', provider: 'google', model: 'gemini-3-pro-image-preview' },
    mediaCapabilities: { inputImages: { max: 14 } },
    paramKeysOverride: ['aspectRatio', 'count', 'imageSize', 'webSearch'],
    paramsSchema: GoogleGeminiImageParamsSchema,
    supportsMedia: true,
    supportsText: true,
  },
  {
    AdvancedFields: ({ fields, form }) => <SeedreamAdvancedFields fields={fields} form={form} supportsPng supportsWebSearch />,
    BasicFields: ({ fields, form }) => <SeedreamBasicFields fields={fields} form={form} sizeOptions={seedream5SizeOptions} />,
    defaults: {
      count: 1,
      optimizePrompt: false,
      size: '2048x2048',
      webSearch: false,
    },
    displayName: 'Seedream 5.0',
    key: { kind: 'image_generation', provider: 'volcengine', model: 'doubao-seedream-5-0-260128' },
    mediaCapabilities: { inputImages: { max: 16 } },
    paramsSchema: VolcengineSeedreamParamsSchema,
    supportsMedia: true,
    supportsText: true,
  },
  {
    AdvancedFields: ({ fields, form }) => (
      <SeedreamAdvancedFields fields={fields} form={form} supportsPng={false} supportsWebSearch={false} />
    ),
    BasicFields: ({ fields, form }) => <SeedreamBasicFields fields={fields} form={form} sizeOptions={seedream45SizeOptions} />,
    defaults: {
      count: 1,
      optimizePrompt: false,
      size: '2048x2048',
      webSearch: false,
    },
    displayName: 'Seedream 4.5',
    key: { kind: 'image_generation', provider: 'volcengine', model: 'doubao-seedream-4-5-251128' },
    mediaCapabilities: { inputImages: { max: 16 } },
    paramKeysOverride: [
      'count',
      'maxImages',
      'optimizePrompt',
      'outputFormat',
      'sequentialImageGeneration',
      'size',
      'watermark',
    ],
    paramsSchema: VolcengineSeedreamParamsSchema,
    supportsMedia: true,
    supportsText: true,
  },
]
