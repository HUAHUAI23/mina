import { createFormHook, createFormHookContexts, type AppFieldExtendedReactFormApi } from '@tanstack/react-form'
import type { FormAsyncValidateOrFn, FormValidateOrFn } from '@tanstack/react-form'
import type { ComponentType, ReactNode } from 'react'
import { cn } from '@mina/ui/lib/utils'

import type { NodeTaskFormValue } from './model-form-utils'
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
const fieldLabelClassName = 'text-[0.68rem] font-black text-foreground-tertiary'
const fieldControlClassName = 'min-h-10 rounded-lg border-0 bg-surface-container-high px-2.5 py-2 text-foreground outline-0 focus:bg-surface-container-lowest focus:shadow-[0_12px_28px_-18px_color-mix(in_oklch,var(--foreground)_18%,transparent)]'
const fieldErrorClassName = 'text-[0.72rem] not-italic text-destructive'
const toolbarSelectClassName = 'inline-flex min-w-0 flex-none items-center gap-[7px] text-foreground'
const toolbarControlClassName = 'min-h-10 min-w-0 appearance-none border-0 bg-transparent text-sm font-bold text-foreground outline-0'
const switchFieldClassName = 'flex items-center justify-between gap-2'
const switchInputClassName = 'relative h-6 w-12 appearance-none rounded-full border-0 bg-surface-container-high after:absolute after:top-[3px] after:left-[3px] after:size-4.5 after:rounded-full after:bg-surface-container-lowest after:shadow-floating checked:bg-foreground-secondary checked:after:translate-x-6'

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
      <input
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
  icon?: ComponentType<{ 'aria-hidden'?: boolean; size?: number }>
  label?: string
  options: SelectOption[]
  valueKind?: 'number' | 'string'
}

function SelectField({ ariaLabel, icon: Icon, label, options, valueKind = 'string' }: SelectFieldProps) {
  const field = useFieldContext<unknown>()
  const error = getFieldErrorMessage(field.state.meta)
  const value = valueToString(field.state.value)

  const select = (
    <select
      aria-invalid={error ? true : undefined}
      aria-label={ariaLabel ?? label}
      className={label ? fieldControlClassName : toolbarControlClassName}
      onBlur={field.handleBlur}
      onChange={(event) => field.handleChange(parseSelectValue(event.target.value, valueKind))}
      value={value}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )

  if (!label) {
    return (
      <label className={toolbarSelectClassName}>
        {Icon ? <Icon aria-hidden={true} size={16} /> : null}
        {select}
      </label>
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
  icon?: ComponentType<{ 'aria-hidden'?: boolean; size?: number }>
  label?: string
  max?: number
  min?: number
  step?: number
}

function NumberField({ ariaLabel, icon: Icon, label, max, min, step }: NumberFieldProps) {
  const field = useFieldContext<unknown>()
  const error = getFieldErrorMessage(field.state.meta)
  const input = (
    <input
      aria-invalid={error ? true : undefined}
      aria-label={ariaLabel ?? label}
      className={label ? fieldControlClassName : `${toolbarControlClassName} w-[72px]`}
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
      <label className={toolbarSelectClassName}>
        {Icon ? <Icon aria-hidden={true} size={16} /> : null}
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
      <input
        aria-invalid={error ? true : undefined}
        className={fieldControlClassName}
        max={max}
        min={min}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
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
        <input
          checked={Boolean(field.state.value)}
          className={switchInputClassName}
          onBlur={field.handleBlur}
          onChange={(event) => field.handleChange(event.target.checked)}
          type="checkbox"
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
  FormValidateOrFn<NodeTaskFormValue> | undefined,
  FormAsyncValidateOrFn<NodeTaskFormValue> | undefined,
  FormValidateOrFn<NodeTaskFormValue> | undefined,
  FormAsyncValidateOrFn<NodeTaskFormValue> | undefined,
  FormValidateOrFn<NodeTaskFormValue> | undefined,
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
