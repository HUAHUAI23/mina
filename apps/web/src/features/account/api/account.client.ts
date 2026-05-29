import type {
  AccountBillingOverview,
  AccountProfileResponse,
  AccountStorageOverview,
  ChangePasswordInput,
  ChangePasswordResponse,
  UpdateAccountPreferencesInput,
  UpdateAccountProfileInput,
} from '@mina/contracts/modules/accounts'
import {
  AccountBillingOverviewSchema,
  AccountProfileResponseSchema,
  AccountStorageOverviewSchema,
  ChangePasswordResponseSchema,
} from '@mina/contracts/modules/accounts'

import { apiClient } from '../../../lib/api-client'
import { readJson } from '../../../lib/http'

export const getAccountProfile = async (): Promise<AccountProfileResponse> => {
  const response = await apiClient.api.account.me.$get()
  return readJson(response, AccountProfileResponseSchema)
}

export const updateAccountProfile = async (
  input: UpdateAccountProfileInput,
): Promise<AccountProfileResponse> => {
  const response = await apiClient.api.account.profile.$patch({ json: input })
  return readJson(response, AccountProfileResponseSchema)
}

export const uploadAccountAvatar = async (file: File): Promise<AccountProfileResponse> => {
  const response = await apiClient.api.account.avatar.$post({ form: { file } })
  return readJson(response, AccountProfileResponseSchema)
}

export const changeAccountPassword = async (
  input: ChangePasswordInput,
): Promise<ChangePasswordResponse> => {
  const response = await apiClient.api.account.password.$patch({ json: input })
  return readJson(response, ChangePasswordResponseSchema)
}

export const updateAccountPreferences = async (
  input: UpdateAccountPreferencesInput,
): Promise<AccountProfileResponse> => {
  const response = await apiClient.api.account.preferences.$patch({ json: input })
  return readJson(response, AccountProfileResponseSchema)
}

export const getAccountStorage = async (): Promise<AccountStorageOverview> => {
  const response = await apiClient.api.account.storage.$get()
  return readJson(response, AccountStorageOverviewSchema)
}

export const getAccountBilling = async (): Promise<AccountBillingOverview> => {
  const response = await apiClient.api.account.billing.$get()
  return readJson(response, AccountBillingOverviewSchema)
}
