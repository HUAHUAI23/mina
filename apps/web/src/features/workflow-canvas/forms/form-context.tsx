import { createFormHook, createFormHookContexts, type AppFieldExtendedReactFormApi } from '@tanstack/react-form'
import type { FormAsyncValidateOrFn, FormValidateOrFn } from '@tanstack/react-form'
import type { ReactNode } from 'react'
import { cn } from '@mina/ui/lib/utils'
import { Input } from '@mina/ui/components/input'
import { NativeSelect, NativeSelectOption } from '@mina/ui/components/native-select'
import { Slider } from '@mina/ui/components/slider'
import { Switch } from '@mina/ui/components/switch'

import type { NodeTaskFormValue } from './model-form-utils'
import type { NodeTaskFormValidator } from './validation'
import { PromptField } from './shared/PromptField'

const {
  fieldContext,
  formContext,
  useFieldContext,
  useFormContext,
} = createFormHookContexts()

function FormShell({ children }: { children: ReactNode }) {
  return <>{children}</>
}

const fieldClassName = 'grid gap-1.5'
const fieldLabelClassName = 'text-[0.68rem] font-semibold text-foreground-tertiary'
const fieldControlClassName = 'h-10 rounded-[14px] border-0 bg-[color-mix(in_oklch,var(--surface-container-lowest)_72%,var(--surface-container-low))] px-3 text-sm font-semibold text-foreground shadow-sm ring-1 ring-foreground-quaternary/10 focus-visible:border-transparent focus-visible:ring-1 focus-visible:bg-surface-container-lowest aria-invalid:ring-destructive/40 [&>svg]:hidden'
const fieldErrorClassName = 'text-[0.72rem] not-italic text-destructive'
const toolbarFieldFrameClassName = 'group flex min-w-0 items-center'
const toolbarFieldLabelClassName = 'sr-only'
const toolbarNumberClassName = 'h-9 w-[3.5rem] rounded-[10px] border-0 bg-black/[0.03] dark:bg-white/[0.05] hover:bg-black/[0.06] dark:hover:bg-white/[0.08] px-2 text-center text-[0.85rem] font-medium text-foreground transition-all shadow-none focus-visible:border-transparent focus-visible:ring-0 focus-visible:bg-black/[0.08] dark:focus-visible:bg-white/[0.12] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [appearance:textfield]'
const switchFieldClassName = 'flex items-center justify-between gap-2'
const fieldSelectClassName = 'w-full [&_[data-slot=native-select]]:h-10 [&_[data-slot=native-select]]:rounded-[14px] [&_[data-slot=native-select]]:border-0 [&_[data-slot=native-select]]:bg-[color-mix(in_oklch,var(--surface-container-lowest)_72%,var(--surface-container-low))] [&_[data-slot=native-select]]:px-3 [&_[data-slot=native-select]]:text-sm [&_[data-slot=native-select]]:font-semibold [&_[data-slot=native-select]]:text-foreground [&_[data-slot=native-select]]:shadow-sm [&_[data-slot=native-select]]:ring-1 [&_[data-slot=native-select]]:ring-foreground-quaternary/10 [&_[data-slot=native-select]]:focus-visible:border-transparent [&_[data-slot=native-select]]:focus-visible:ring-1 [&_[data-slot=native-select]]:focus-visible:bg-surface-container-lowest [&_[data-slot=native-select-icon]]:hidden'
const toolbarSelectClassName = 'w-fit flex-none [&_[data-slot=native-select]]:h-9 [&_[data-slot=native-select]]:min-w-[4rem] [&_[data-slot=native-select]]:rounded-[10px] [&_[data-slot=native-select]]:border-0 [&_[data-slot=native-select]]:bg-black/[0.03] dark:[&_[data-slot=native-select]]:bg-white/[0.05] hover:[&_[data-slot=native-select]]:bg-black/[0.06] dark:hover:[&_[data-slot=native-select]]:bg-white/[0.08] [&_[data-slot=native-select]]:pl-3 [&_[data-slot=native-select]]:pr-8 [&_[data-slot=native-select]]:text-[0.85rem] [&_[data-slot=native-select]]:font-medium [&_[data-slot=native-select]]:text-foreground [&_[data-slot=native-select]]:transition-all [&_[data-slot=native-select]]:shadow-none [&_[data-slot=native-select]]:focus-visible:border-transparent [&_[data-slot=native-select]]:focus-visible:ring-0 [&_[data-slot=native-select]]:focus-visible:bg-black/[0.08] dark:[&_[data-slot=native-select]]:focus-visible:bg-white/[0.12] [&_[data-slot=native-select-icon]]:text-foreground-secondary [&_[data-slot=native-select-icon]]:right-2.5'
const sliderClassName = '[&_[data-slot=slider-track]]:h-1.5 [&_[data-slot=slider-track]]:bg-surface-container-high [&_[data-slot=slider-range]]:bg-foreground-secondary [&_[data-slot=slider-thumb]]:size-4 [&_[data-slot=slider-thumb]]:border-0 [&_[data-slot=slider-thumb]]:bg-surface-container-lowest [&_[data-slot=slider-thumb]]:shadow-sm [&_[data-slot=slider-thumb]]:ring-1 [&_[data-slot=slider-thumb]]:ring-foreground-quaternary/20'

interface SelectOption {
  label: string
  value: string
}

export interface TextFieldProps {
  ariaLabel?: string
  inputClassName?: string | undefined
  label?: string
  multiline?: boolean
  placeholder?: string
  textareaClassName?: string | undefined
}

function TextField({ ariaLabel, inputClassName, label, multiline = false, placeholder, textareaClassName }: TextFieldProps) {
  const field = useFieldContext<string>()
  const error = getFieldErrorMessage(field.state.meta)

  if (multiline) {
    return (
      <PromptField
        error={error}
        label={label}
        onBlur={field.handleBlur}
        onChange={field.handleChange}
        placeholder={placeholder}
        textareaClassName={textareaClassName}
        value={field.state.value ?? ''}
      />
    )
  }

  return (
    <label className={fieldClassName}>
      {label ? <span className={fieldLabelClassName}>{label}</span> : null}
      <Input
        aria-invalid={error ? true : undefined}
        aria-label={ariaLabel ?? label}
        className={cn(fieldControlClassName, inputClassName)}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
        placeholder={placeholder}
        type="text"
        value={field.state.value ?? ''}
      />
      {error ? <em className={fieldErrorClassName}>{error}</em> : null}
    </label>
  )
}

export interface SelectFieldProps {
  ariaLabel?: string
  label?: string
  options: SelectOption[]
  valueKind?: 'number' | 'string'
}

function SelectField({ ariaLabel, label, options, valueKind = 'string' }: SelectFieldProps) {
  const field = useFieldContext<unknown>()
  const error = getFieldErrorMessage(field.state.meta)
  const value = valueToString(field.state.value)

  const select = (
    <NativeSelect
      aria-invalid={error ? true : undefined}
      aria-label={ariaLabel ?? label}
      className={label ? fieldSelectClassName : toolbarSelectClassName}
      onBlur={field.handleBlur}
      onChange={(event) => field.handleChange(parseSelectValue(event.target.value, valueKind))}
      value={value}
    >
      {options.map((option) => (
        <NativeSelectOption key={option.value} value={option.value}>
          {option.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )

  if (!label) {
    return (
      <div className={toolbarFieldFrameClassName}>
        {ariaLabel ? <span className={toolbarFieldLabelClassName}>{ariaLabel}</span> : null}
        {select}
      </div>
    )
  }

  return (
    <label className={fieldClassName}>
      <span className={fieldLabelClassName}>{label}</span>
      {select}
      {error ? <em className={fieldErrorClassName}>{error}</em> : null}
    </label>
  )
}

export interface NumberFieldProps {
  ariaLabel?: string
  label?: string
  max?: number
  min?: number
  step?: number
}

function NumberField({ ariaLabel, label, max, min, step }: NumberFieldProps) {
  const field = useFieldContext<unknown>()
  const error = getFieldErrorMessage(field.state.meta)
  const input = (
    <Input
      aria-invalid={error ? true : undefined}
      aria-label={ariaLabel ?? label}
      className={label ? fieldControlClassName : toolbarNumberClassName}
      max={max}
      min={min}
      onBlur={field.handleBlur}
      onChange={(event) => {
        const raw = event.target.value
        field.handleChange(raw === '' ? undefined : Number(raw))
      }}
      step={step}
      type="number"
      value={valueToString(field.state.value)}
    />
  )

  if (!label) {
    return (
      <label className={toolbarFieldFrameClassName}>
        {ariaLabel ? <span className={toolbarFieldLabelClassName}>{ariaLabel}</span> : null}
        {input}
      </label>
    )
  }

  return (
    <label className={fieldClassName}>
      <span className={fieldLabelClassName}>{label}</span>
      {input}
      {error ? <em className={fieldErrorClassName}>{error}</em> : null}
    </label>
  )
}

export interface SliderFieldProps {
  label: string
  max: number
  min: number
  step?: number
}

function SliderField({ label, max, min, step }: SliderFieldProps) {
  const field = useFieldContext<unknown>()
  const value = typeof field.state.value === 'number' ? field.state.value : min
  const error = getFieldErrorMessage(field.state.meta)

  return (
    <label className={fieldClassName}>
      <span className={fieldLabelClassName}>{label}</span>
      <Slider
        aria-invalid={error ? true : undefined}
        className={sliderClassName}
        max={max}
        min={min}
        onBlur={field.handleBlur}
        onValueChange={([nextValue]) => {
          if (typeof nextValue === 'number') {
            field.handleChange(nextValue)
          }
        }}
        value={[value]}
        {...(step === undefined ? {} : { step })}
      />
      {error ? <em className={fieldErrorClassName}>{error}</em> : null}
    </label>
  )
}

export interface SwitchFieldProps {
  label: string
}

function SwitchField({ label }: SwitchFieldProps) {
  const field = useFieldContext<unknown>()
  const error = getFieldErrorMessage(field.state.meta)

  return (
    <div>
      <label className={switchFieldClassName}>
        <span className={fieldLabelClassName}>{label}</span>
        <Switch
          checked={Boolean(field.state.value)}
          className="data-checked:bg-foreground-secondary data-unchecked:bg-surface-container-high"
          size="sm"
          onBlur={field.handleBlur}
          onCheckedChange={field.handleChange}
        />
      </label>
      {error ? <em className="mt-1 block text-[0.72rem] font-bold not-italic text-destructive">{error}</em> : null}
    </div>
  )
}

export interface SubmitButtonProps {
  children: ReactNode
}

function SubmitButton({ children }: SubmitButtonProps) {
  const form = useFormContext()
  return (
    <form.Subscribe selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}>
      {({ canSubmit, isSubmitting }) => (
        <button disabled={!canSubmit || isSubmitting} type="submit">
          {children}
        </button>
      )}
    </form.Subscribe>
  )
}

export const {
  useAppForm: useNodeTaskAppForm,
  withForm: withNodeTaskForm,
  withFieldGroup: withNodeTaskFieldGroup,
} = createFormHook({
  fieldComponents: {
    NumberField,
    SelectField,
    SliderField,
    SwitchField,
    TextField,
  },
  fieldContext,
  formComponents: {
    FormShell,
    SubmitButton,
  },
  formContext,
})

type NodeTaskFieldComponents = {
  NumberField: typeof NumberField
  SelectField: typeof SelectField
  SliderField: typeof SliderField
  SwitchField: typeof SwitchField
  TextField: typeof TextField
}

type NodeTaskFormComponents = {
  FormShell: typeof FormShell
  SubmitButton: typeof SubmitButton
}

export type NodeTaskFormApi = AppFieldExtendedReactFormApi<
  NodeTaskFormValue,
  FormValidateOrFn<NodeTaskFormValue> | undefined,
  NodeTaskFormValidator,
  FormAsyncValidateOrFn<NodeTaskFormValue> | undefined,
  FormValidateOrFn<NodeTaskFormValue> | undefined,
  FormAsyncValidateOrFn<NodeTaskFormValue> | undefined,
  NodeTaskFormValidator,
  FormAsyncValidateOrFn<NodeTaskFormValue> | undefined,
  FormValidateOrFn<NodeTaskFormValue> | undefined,
  FormAsyncValidateOrFn<NodeTaskFormValue> | undefined,
  FormAsyncValidateOrFn<NodeTaskFormValue> | undefined,
  unknown,
  NodeTaskFieldComponents,
  NodeTaskFormComponents
>

const valueToString = (value: unknown): string =>
  value === undefined || value === null ? '' : String(value)

const parseSelectValue = (value: string, valueKind: 'number' | 'string'): number | string | undefined => {
  if (value === '') {
    return undefined
  }
  return valueKind === 'number' ? Number(value) : value
}

export const getFieldErrorMessage = (meta: { errors: unknown[] }): string | undefined => {
  const [error] = meta.errors
  if (!error) {
    return undefined
  }
  if (typeof error === 'string') {
    return error
  }
  if (typeof error === 'object' && error && 'message' in error) {
    return String(error.message)
  }
  return String(error)
}
