import type { PropsWithChildren } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@mina/ui/components/tooltip'

import { AuthProvider } from '../features/auth/components/auth-provider'
import { ClientModelRegistryProvider } from '../features/workflow-canvas/forms/registry/client-model-registry'
import { allClientModelSpecs } from '../features/workflow-canvas/forms/registry'
import { I18nProvider } from './i18n-provider'
import { createQueryClient } from './query-client'

const queryClient = createQueryClient()

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <AuthProvider>
          <ClientModelRegistryProvider specs={allClientModelSpecs}>
            <TooltipProvider>{children}</TooltipProvider>
          </ClientModelRegistryProvider>
        </AuthProvider>
      </I18nProvider>
    </QueryClientProvider>
  )
}
