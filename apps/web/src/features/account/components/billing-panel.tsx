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
      <section className="mx-auto grid w-full max-w-2xl gap-6">
        <h2 className="m-0 text-left text-3xl font-normal leading-tight text-foreground">{m.account_billing_title()}</h2>

        {billing ? (
          <div className="grid gap-6">
            <div className="grid gap-2">
              <span className="text-sm font-normal text-foreground">{m.account_billing_plan_label()}</span>
              <div className="flex h-11 items-center rounded-lg bg-gray-100 px-4 text-base font-normal text-foreground">
                {billing.planName}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-5 max-sm:grid-cols-1">
              <div className="grid gap-2">
                <span className="text-sm font-normal text-foreground">{m.account_billing_status_label()}</span>
                <div className="flex h-11 items-center rounded-lg bg-gray-100 px-4 text-base font-normal text-foreground">
                  {m.account_billing_status_inactive()}
                </div>
              </div>
              <div className="grid gap-2">
                <span className="text-sm font-normal text-foreground">{m.account_billing_credit_label()}</span>
                <div className="flex h-11 items-center rounded-lg bg-gray-100 px-4 text-base font-normal text-foreground">
                  {m.account_billing_credit_value({ credits: billing.creditBalance })}
                </div>
              </div>
            </div>

            <p className="m-0 rounded-lg bg-gray-100 px-4 py-3 text-sm font-normal leading-6 text-foreground-secondary">{m.account_billing_placeholder()}</p>

            <button className="h-11 rounded-lg border-0 bg-gray-100 px-4 text-base font-normal text-foreground-tertiary hover:bg-brand-accent hover:text-primary-foreground" type="button">
              {m.account_billing_top_up_button()}
            </button>
          </div>
        ) : (
          <div className="grid gap-6">
            <Skeleton className="h-11 w-full rounded-lg" />
            <div className="grid grid-cols-2 gap-5 max-sm:grid-cols-1">
              <Skeleton className="h-11 w-full rounded-lg" />
              <Skeleton className="h-11 w-full rounded-lg" />
            </div>
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-11 w-full rounded-lg" />
          </div>
        )}
      </section>
    </AccountPageShell>
  )
}
