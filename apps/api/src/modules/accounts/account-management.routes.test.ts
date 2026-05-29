import { describe, expect, test } from 'bun:test'
import {
  AccountBillingOverviewSchema,
  AccountProfileResponseSchema,
  AccountStorageOverviewSchema,
  ChangePasswordResponseSchema,
} from '@mina/contracts/modules/accounts'

import { createTestApp } from '../../test/app'

const readAuthToken = (value: unknown): string => {
  if (
    value &&
    typeof value === 'object' &&
    'session' in value &&
    value.session &&
    typeof value.session === 'object' &&
    'token' in value.session &&
    typeof value.session.token === 'string'
  ) {
    return value.session.token
  }
  throw new Error('Registration response did not include a session token.')
}

const register = async (app: ReturnType<typeof createTestApp>) => {
  const response = await app.request('/api/auth/register', {
    body: JSON.stringify({
      displayName: 'Original Name',
      email: `account-${crypto.randomUUID()}@example.com`,
      password: 'correct horse battery staple',
      username: `account_${crypto.randomUUID().slice(0, 8)}`,
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
  expect(response.status).toBe(201)
  return readAuthToken(await response.json())
}

const authHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
})

describe('account management routes', () => {
  test('requires authentication for account profile', async () => {
    const app = createTestApp()

    const response = await app.request('/api/account/me')

    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({
      error: { code: 'UNAUTHENTICATED' },
    })
  })

  test('returns and updates the current account profile', async () => {
    const app = createTestApp()
    const token = await register(app)

    const initialResponse = await app.request('/api/account/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(initialResponse.status).toBe(200)
    const initialProfile = AccountProfileResponseSchema.parse(await initialResponse.json())
    expect(initialProfile.user.displayName).toBe('Original Name')

    const updateResponse = await app.request('/api/account/profile', {
      body: JSON.stringify({ displayName: 'Updated Name' }),
      headers: authHeaders(token),
      method: 'PATCH',
    })
    expect(updateResponse.status).toBe(200)
    const updatedProfile = AccountProfileResponseSchema.parse(await updateResponse.json())
    expect(updatedProfile.user.displayName).toBe('Updated Name')
  })

  test('changes password after validating the current password', async () => {
    const app = createTestApp()
    const token = await register(app)

    const invalidResponse = await app.request('/api/account/password', {
      body: JSON.stringify({
        currentPassword: 'wrong password',
        newPassword: 'new correct horse battery staple',
      }),
      headers: authHeaders(token),
      method: 'PATCH',
    })
    expect(invalidResponse.status).toBe(401)
    expect(await invalidResponse.json()).toMatchObject({
      error: { code: 'ACCOUNT_CURRENT_PASSWORD_INVALID' },
    })

    const updateResponse = await app.request('/api/account/password', {
      body: JSON.stringify({
        currentPassword: 'correct horse battery staple',
        newPassword: 'new correct horse battery staple',
      }),
      headers: authHeaders(token),
      method: 'PATCH',
    })
    expect(updateResponse.status).toBe(200)
    expect(ChangePasswordResponseSchema.parse(await updateResponse.json())).toEqual({ success: true })
  })

  test('persists preferred locale through account preferences', async () => {
    const app = createTestApp()
    const token = await register(app)

    const response = await app.request('/api/account/preferences', {
      body: JSON.stringify({ preferredLocale: 'zh-Hans' }),
      headers: authHeaders(token),
      method: 'PATCH',
    })

    expect(response.status).toBe(200)
    const payload = AccountProfileResponseSchema.parse(await response.json())
    expect(payload.user.preferredLocale).toBe('zh-Hans')
  })

  test('uploads avatar and returns a display URL', async () => {
    const app = createTestApp()
    const token = await register(app)
    const form = new FormData()
    form.set('file', new File([new Uint8Array([1, 2, 3])], 'avatar.png', { type: 'image/png' }))

    const response = await app.request('/api/account/avatar', {
      body: form,
      headers: { Authorization: `Bearer ${token}` },
      method: 'POST',
    })

    expect(response.status).toBe(200)
    const payload = AccountProfileResponseSchema.parse(await response.json())
    expect(payload.user.avatarUrl).toMatch(/^fake:\/\//)
  })

  test('rejects unsupported avatar MIME types', async () => {
    const app = createTestApp()
    const token = await register(app)
    const form = new FormData()
    form.set('file', new File([new Uint8Array([1, 2, 3])], 'avatar.txt', { type: 'text/plain' }))

    const response = await app.request('/api/account/avatar', {
      body: form,
      headers: { Authorization: `Bearer ${token}` },
      method: 'POST',
    })

    expect(response.status).toBe(415)
    expect(await response.json()).toMatchObject({
      error: { code: 'ACCOUNT_AVATAR_TYPE_UNSUPPORTED' },
    })
  })

  test('rejects missing and oversized avatar files', async () => {
    const app = createTestApp()
    const token = await register(app)
    const missingForm = new FormData()

    const missingResponse = await app.request('/api/account/avatar', {
      body: missingForm,
      headers: { Authorization: `Bearer ${token}` },
      method: 'POST',
    })

    expect(missingResponse.status).toBe(422)
    expect(await missingResponse.json()).toMatchObject({
      error: { code: 'ACCOUNT_AVATAR_FILE_REQUIRED' },
    })

    const oversizedForm = new FormData()
    oversizedForm.set(
      'file',
      new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'avatar.png', { type: 'image/png' }),
    )

    const oversizedResponse = await app.request('/api/account/avatar', {
      body: oversizedForm,
      headers: { Authorization: `Bearer ${token}` },
      method: 'POST',
    })

    expect(oversizedResponse.status).toBe(413)
    expect(await oversizedResponse.json()).toMatchObject({
      error: { code: 'ACCOUNT_AVATAR_UPLOAD_TOO_LARGE' },
    })
  })

  test('returns storage and billing overviews', async () => {
    const app = createTestApp()
    const token = await register(app)

    const storageResponse = await app.request('/api/account/storage', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(storageResponse.status).toBe(200)
    const storage = AccountStorageOverviewSchema.parse(await storageResponse.json())
    expect(storage).toMatchObject({
      planName: 'Free',
      quotaBytes: 1024 * 1024 * 1024,
      usedBytes: 0,
    })

    const billingResponse = await app.request('/api/account/billing', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(billingResponse.status).toBe(200)
    const billing = AccountBillingOverviewSchema.parse(await billingResponse.json())
    expect(billing).toEqual({
      billingStatus: 'inactive',
      creditBalance: 0,
      currency: 'USD',
      planName: 'Free',
    })
  })
})
