import { useQuery } from '@tanstack/react-query'

import {
  getAccountBilling,
  getAccountProfile,
  getAccountStorage,
} from '../api/account.client'
import { accountKeys } from '../api/account-keys'

export const useAccountProfile = () =>
  useQuery({
    queryFn: getAccountProfile,
    queryKey: accountKeys.profile(),
  })

export const useAccountStorage = () =>
  useQuery({
    queryFn: getAccountStorage,
    queryKey: accountKeys.storage(),
  })

export const useAccountBilling = () =>
  useQuery({
    queryFn: getAccountBilling,
    queryKey: accountKeys.billing(),
  })
