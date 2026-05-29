import { Database } from 'lucide-react'
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
      <section className="grid gap-6 rounded-md border border-outline-ghost bg-surface-container-lowest p-6 shadow-floating max-md:p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-md bg-brand-accent/10 text-brand-accent">
            <Database aria-hidden="true" size={18} />
          </span>
          <div className="grid min-w-0 gap-1">
            <strong className="text-sm font-bold text-foreground">{m.account_storage_plan_label()}</strong>
            {storage ? (
              <span className="text-sm text-foreground-secondary">{storage.planName}</span>
            ) : (
              <Skeleton className="h-4 w-20" />
            )}
          </div>
        </div>

        {storage ? (
          <div className="grid gap-3">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="font-bold text-foreground">{m.account_storage_used_label()}</span>
              <span className="text-foreground-secondary">
                {m.account_storage_usage_value({
                  quota: formatNumber(bytesToGigabytes(storage.quotaBytes), locale),
                  used: formatNumber(bytesToGigabytes(storage.usedBytes), locale),
                })}
              </span>
            </div>
            <Progress className="h-2 bg-gray-100" value={usagePercent} />
            <p className="m-0 text-sm text-foreground-secondary">
              {m.account_storage_percent_used({ percent: formatNumber(usagePercent, locale) })}
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-4 w-40" />
          </div>
        )}
      </section>
    </AccountPageShell>
  )
}
