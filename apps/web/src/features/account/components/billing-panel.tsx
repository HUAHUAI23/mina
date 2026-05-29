import { CreditCard } from 'lucide-react'

import { Badge } from '@mina/ui/components/badge'
import { Skeleton } from '@mina/ui/components/skeleton'

import { useMessages } from '../../../app/i18n-provider'
import { useAccountBilling } from '../hooks/use-account-queries'
import { AccountPageShell } from './account-page-shell'

export function BillingPanel() {
  const m = useMessages()
  const billingQuery = useAccountBilling()
  const billing = billingQuery.data

  return (
    <AccountPageShell description={m.account_billing_description()} title={m.account_billing_title()}>
      <section className="grid gap-6 rounded-md border border-outline-ghost bg-surface-container-lowest p-6 shadow-floating max-md:p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-md bg-brand-accent/10 text-brand-accent">
            <CreditCard aria-hidden="true" size={18} />
          </span>
          <div className="grid min-w-0 gap-1">
            <strong className="text-sm font-bold text-foreground">{m.account_billing_plan_label()}</strong>
            {billing ? (
              <span className="text-sm text-foreground-secondary">{billing.planName}</span>
            ) : (
              <Skeleton className="h-4 w-20" />
            )}
          </div>
        </div>

        {billing ? (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
              <div className="grid gap-1 rounded-md border border-outline-ghost p-4">
                <span className="text-xs font-bold uppercase text-foreground-tertiary">{m.account_billing_status_label()}</span>
                <Badge className="w-fit bg-gray-100 text-brand-accent hover:bg-gray-100">
                  {m.account_billing_status_inactive()}
                </Badge>
              </div>
              <div className="grid gap-1 rounded-md border border-outline-ghost p-4">
                <span className="text-xs font-bold uppercase text-foreground-tertiary">{m.account_billing_credit_label()}</span>
                <strong className="text-base font-bold text-foreground">
                  {billing.currency} {billing.creditBalance}
                </strong>
              </div>
            </div>
            <p className="m-0 text-sm leading-6 text-foreground-secondary">{m.account_billing_placeholder()}</p>
          </div>
        ) : (
          <div className="grid gap-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        )}
      </section>
    </AccountPageShell>
  )
}
