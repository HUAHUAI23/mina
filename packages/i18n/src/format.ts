import type { MinaLocale } from './locale'
import { localeToIntlLocale } from './locale'

type DateInput = Date | string | number

const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>()
const dateFormatters = new Map<string, Intl.DateTimeFormat>()
const numberFormatters = new Map<string, Intl.NumberFormat>()
const relativeTimeFormatters = new Map<string, Intl.RelativeTimeFormat>()

const toDate = (value: DateInput): Date => (value instanceof Date ? value : new Date(value))

const getDateTimeFormatter = (locale: MinaLocale): Intl.DateTimeFormat => {
  const intlLocale = localeToIntlLocale(locale)
  const existing = dateTimeFormatters.get(intlLocale)
  if (existing) {
    return existing
  }

  const formatter = new Intl.DateTimeFormat(intlLocale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  dateTimeFormatters.set(intlLocale, formatter)
  return formatter
}

const getDateFormatter = (locale: MinaLocale): Intl.DateTimeFormat => {
  const intlLocale = localeToIntlLocale(locale)
  const existing = dateFormatters.get(intlLocale)
  if (existing) {
    return existing
  }

  const formatter = new Intl.DateTimeFormat(intlLocale, {
    dateStyle: 'medium',
  })
  dateFormatters.set(intlLocale, formatter)
  return formatter
}

const getNumberFormatter = (locale: MinaLocale): Intl.NumberFormat => {
  const intlLocale = localeToIntlLocale(locale)
  const existing = numberFormatters.get(intlLocale)
  if (existing) {
    return existing
  }

  const formatter = new Intl.NumberFormat(intlLocale)
  numberFormatters.set(intlLocale, formatter)
  return formatter
}

const getRelativeTimeFormatter = (locale: MinaLocale): Intl.RelativeTimeFormat => {
  const intlLocale = localeToIntlLocale(locale)
  const existing = relativeTimeFormatters.get(intlLocale)
  if (existing) {
    return existing
  }

  const formatter = new Intl.RelativeTimeFormat(intlLocale, {
    numeric: 'always',
  })
  relativeTimeFormatters.set(intlLocale, formatter)
  return formatter
}

export const formatDateTime = (value: DateInput, locale: MinaLocale): string => getDateTimeFormatter(locale).format(toDate(value))

export const formatDate = (value: DateInput, locale: MinaLocale): string => getDateFormatter(locale).format(toDate(value))

export const formatNumber = (value: number, locale: MinaLocale): string => getNumberFormatter(locale).format(value)

export const formatRelativeTime = (value: DateInput, locale: MinaLocale, now: DateInput = Date.now()): string => {
  const diffMs = toDate(value).getTime() - toDate(now).getTime()
  const absMs = Math.abs(diffMs)
  const formatter = getRelativeTimeFormatter(locale)
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  const month = 30 * day
  const year = 365 * day

  if (absMs < minute) {
    return formatter.format(Math.round(diffMs / 1000), 'second')
  }
  if (absMs < hour) {
    return formatter.format(Math.round(diffMs / minute), 'minute')
  }
  if (absMs < day) {
    return formatter.format(Math.round(diffMs / hour), 'hour')
  }
  if (absMs < month) {
    return formatter.format(Math.round(diffMs / day), 'day')
  }
  if (absMs < year) {
    return formatter.format(Math.round(diffMs / month), 'month')
  }
  return formatter.format(Math.round(diffMs / year), 'year')
}
