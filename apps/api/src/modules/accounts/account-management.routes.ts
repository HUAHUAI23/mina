import {
  AccountAvatarUploadResponseSchema,
  AccountBillingOverviewSchema,
  AccountProfileResponseSchema,
  AccountStorageOverviewSchema,
  ChangePasswordResponseSchema,
  ChangePasswordSchema,
  UpdateAccountPreferencesSchema,
  UpdateAccountProfileSchema,
} from '@mina/contracts/modules/accounts'
import { Hono } from 'hono'

import { HttpError } from '../../lib/http/http-error'
import {
  PRIVATE_CONTENT_CACHE_CONTROL,
  PRIVATE_CONTENT_READ_URL_EXPIRES_SECONDS,
  setPrivateContentRedirectHeaders,
} from '../../lib/http/private-content-redirect'
import { apiValidator } from '../../lib/http/validation'
import type { AccountsService } from './accounts.service'
import { requireAuthActor } from './auth-middleware'
import type { AccountManagementService } from './account-management.service'

export const createAccountManagementRoutes = (
  accountManagementService: AccountManagementService,
  accountsService: AccountsService,
): Hono =>
  new Hono()
    .get('/me', async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      return c.json(AccountProfileResponseSchema.parse(await accountManagementService.getProfile(actor)))
    })
    .patch('/profile', apiValidator('json', UpdateAccountProfileSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const payload = c.req.valid('json')
      return c.json(AccountProfileResponseSchema.parse(await accountManagementService.updateProfile(actor, payload)))
    })
    .post('/avatar', async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const form = await c.req.formData()
      const file = form.get('file')
      if (!(file instanceof File)) {
        throw new HttpError(422, 'ACCOUNT_AVATAR_FILE_REQUIRED', {
          fallbackMessage: 'An avatar file is required.',
          messageKey: 'api_error_account_avatar_file_required',
        })
      }
      return c.json(
        AccountAvatarUploadResponseSchema.parse(
          await accountManagementService.updateAvatar(actor, {
            body: new Uint8Array(await file.arrayBuffer()),
            mimeType: file.type,
          }),
        ),
      )
    })
    .get('/avatar/content', async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      setPrivateContentRedirectHeaders(c)
      return c.redirect(
        await accountManagementService.createAvatarReadUrl(actor, {
          expiresInSeconds: PRIVATE_CONTENT_READ_URL_EXPIRES_SECONDS,
          responseCacheControl: PRIVATE_CONTENT_CACHE_CONTROL,
        }),
        302,
      )
    })
    .patch('/password', apiValidator('json', ChangePasswordSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const payload = c.req.valid('json')
      return c.json(ChangePasswordResponseSchema.parse(await accountManagementService.changePassword(actor, payload)))
    })
    .patch('/preferences', apiValidator('json', UpdateAccountPreferencesSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const payload = c.req.valid('json')
      return c.json(AccountProfileResponseSchema.parse(await accountManagementService.updatePreferences(actor, payload)))
    })
    .get('/storage', async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      return c.json(AccountStorageOverviewSchema.parse(await accountManagementService.getStorageOverview(actor)))
    })
    .get('/billing', async (c) => {
      await requireAuthActor(c, accountsService)
      return c.json(AccountBillingOverviewSchema.parse(accountManagementService.getBillingOverview()))
    })
