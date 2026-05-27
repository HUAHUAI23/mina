import type { MinaLocale } from './locale'
import { localeToIntlLocale } from './locale'

type DateInput = Date | string | number

const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>()
const dateFormatters = new Map<string, Intl.DateTimeFormat>()
const numberFormatters = new Map<string, Intl.NumberFormat>()

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

export const formatDateTime = (value: DateInput, locale: MinaLocale): string => getDateTimeFormatter(locale).format(toDate(value))

export const formatDate = (value: DateInput, locale: MinaLocale): string => getDateFormatter(locale).format(toDate(value))

export const formatNumber = (value: number, locale: MinaLocale): string => getNumberFormatter(locale).format(value)
