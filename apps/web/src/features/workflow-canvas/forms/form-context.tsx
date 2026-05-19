import { createFormHook, createFormHookContexts } from '@tanstack/react-form'
import type { ReactNode } from 'react'

const { fieldContext, formContext } = createFormHookContexts()

function FormShell({ children }: { children: ReactNode }) {
  return <>{children}</>
}

export const { useAppForm: useNodeTaskAppForm } = createFormHook({
  fieldComponents: {},
  fieldContext,
  formComponents: {
    FormShell,
  },
  formContext,
})

export type NodeTaskFormApi = ReturnType<typeof useNodeTaskAppForm>
