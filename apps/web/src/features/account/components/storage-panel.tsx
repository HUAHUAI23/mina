import { formatNumber } from '@mina/i18n'

import { Progress } from '@mina/ui/components/progress'
import { Skeleton } from '@mina/ui/components/skeleton'

import { useI18n } from '../../../app/i18n-provider'
import { useAccountStorage } from '../hooks/use-account-queries'
import { AccountPageShell } from './account-page-shell'

const bytesToGigabytes = (bytes: number): number => bytes / 1024 / 1024 / 1024

export function StoragePanel() {
  const { locale, messages: m } = useI18n()
  const storageQuery = useAccountStorage()
  const storage = storageQuery.data
  const usagePercent = storage && storage.quotaBytes > 0 ? Math.min((storage.usedBytes / storage.quotaBytes) * 100, 100) : 0

  return (
    <AccountPageShell description={m.account_storage_description()} title={m.account_storage_title()}>
      <section className="mx-auto grid w-full max-w-2xl gap-6">
        <h2 className="m-0 text-left text-3xl font-normal leading-tight text-foreground">{m.account_storage_title()}</h2>

        {storage ? (
          <div className="grid gap-6">
            <div className="grid gap-2">
              <span className="text-sm font-normal text-foreground">{m.account_storage_plan_label()}</span>
              <div className="flex h-11 items-center rounded-lg bg-gray-100 px-4 text-base font-normal text-foreground">
                {storage.planName}
              </div>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-4 text-sm font-normal text-foreground">
                <span>{m.account_storage_used_label()}</span>
                <span>
                  {m.account_storage_usage_value({
                    quota: formatNumber(bytesToGigabytes(storage.quotaBytes), locale),
                    used: formatNumber(bytesToGigabytes(storage.usedBytes), locale),
                  })}
                </span>
              </div>
              <Progress className="h-3 bg-gray-100" value={usagePercent} />
              <p className="m-0 text-sm font-normal text-foreground-secondary">
                {m.account_storage_percent_used({ percent: formatNumber(usagePercent, locale) })}
              </p>
            </div>

            <button className="h-11 rounded-lg border-0 bg-gray-100 px-4 text-base font-normal text-foreground-tertiary hover:bg-brand-accent hover:text-primary-foreground" type="button">
              {m.account_storage_manage_button()}
            </button>
          </div>
        ) : (
          <div className="grid gap-6">
            <Skeleton className="h-11 w-full rounded-lg" />
            <Skeleton className="h-3 w-full rounded-full" />
            <Skeleton className="h-11 w-full rounded-lg" />
          </div>
        )}
      </section>
    </AccountPageShell>
  )
}
