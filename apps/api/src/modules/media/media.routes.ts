import {
  CompletePresignedMediaUploadSchema,
  CreateMediaObjectSchema,
  CreatePresignedMediaUploadSchema,
  GetMediaObjectResponseSchema,
  MediaObjectResponseSchema,
  type MediaObjectPurpose,
  type MediaObjectRetention,
} from '@mina/contracts/modules/media/media-object'
import { z } from 'zod'
import { Hono } from 'hono'

import { apiEnv } from '../../config/env'
import { HttpError } from '../../lib/http/http-error'
import { setPrivateContentRedirectHeaders } from '../../lib/http/private-content-redirect'
import { apiValidator } from '../../lib/http/validation'
import { requireAuthActor } from '../accounts/auth-middleware'
import { assertCanManagePublicResource } from '../accounts/authorization'
import type { AccountsService } from '../accounts/accounts.service'
import { resourceKindFromMimeType } from './media-type'
import type { MediaObjectService } from './media-object.service'

const MediaObjectParamsSchema = z.object({
  id: z.string().min(1),
})

const formValue = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

const parsePurpose = (value: string | undefined): MediaObjectPurpose =>
  CreateMediaObjectSchema.shape.purpose.parse(value ?? 'workflow_slot')

const parseRetention = (value: string | undefined): MediaObjectRetention =>
  CreateMediaObjectSchema.shape.retention.parse(value ?? 'project_scoped')

export const createMediaRoutes = (mediaObjectService: MediaObjectService, accountsService: AccountsService): Hono =>
  new Hono()
    .post('/media-objects', async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const form = await c.req.formData()
      const file = form.get('file')
      if (!(file instanceof File)) {
        throw new HttpError(422, 'MEDIA_FILE_REQUIRED', {
          fallbackMessage: 'A file field is required.',
          messageKey: 'api_error_media_file_required',
        })
      }
      if (file.size > apiEnv.mediaUploadMaxBytes) {
        throw new HttpError(413, 'MEDIA_UPLOAD_TOO_LARGE', {
          fallbackMessage: 'Media upload is too large.',
          messageKey: 'api_error_media_upload_too_large',
        })
      }

      const declaredKind = CreateMediaObjectSchema.shape.kind.parse(formValue(form.get('kind')))
      const kind = declaredKind ?? resourceKindFromMimeType(file.type)
      if (!kind) {
        throw new HttpError(415, 'MEDIA_TYPE_UNSUPPORTED', {
          fallbackMessage: 'Media MIME type is not supported.',
          messageKey: 'api_error_media_type_unsupported',
        })
      }

      const mediaObject = await mediaObjectService.createFromBuffer({
        accountId: actor.accountId,
        body: new Uint8Array(await file.arrayBuffer()),
        kind,
        ...(file.type ? { mimeType: file.type } : {}),
        origin: 'user_upload',
        purpose: (() => {
          const purpose = parsePurpose(formValue(form.get('purpose')))
          if (purpose === 'public_library') {
            assertCanManagePublicResource(actor)
          }
          return purpose
        })(),
        retention: parseRetention(formValue(form.get('retention'))),
      })
      return c.json(MediaObjectResponseSchema.parse({ item: mediaObject }), 201)
    })
    .get('/media-objects/:id', apiValidator('param', MediaObjectParamsSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const { id } = c.req.valid('param')
      return c.json(GetMediaObjectResponseSchema.parse({ item: await mediaObjectService.getMediaObject(actor.accountId, id) }))
    })
    .get('/media-objects/:id/content', apiValidator('param', MediaObjectParamsSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const { id } = c.req.valid('param')
      setPrivateContentRedirectHeaders(c)
      return c.redirect(await mediaObjectService.createReadUrl(actor.accountId, id), 302)
    })
    .post(
      '/media-objects/presigned-upload',
      apiValidator('json', CreatePresignedMediaUploadSchema),
      async (c) => {
        const actor = await requireAuthActor(c, accountsService)
        const payload = c.req.valid('json')
        if (payload.purpose === 'public_library') {
          assertCanManagePublicResource(actor)
        }
        const result = await mediaObjectService.createPresignedUpload({
          accountId: actor.accountId,
          kind: payload.kind,
          mimeType: payload.mimeType,
          ...(payload.byteSize !== undefined ? { byteSize: payload.byteSize } : {}),
          purpose: payload.purpose,
          retention: payload.retention,
        })
        return c.json(
          {
            item: result.mediaObject,
            uploadUrl: result.upload.url,
            storageKey: result.upload.key,
            expiresAt: result.upload.expiresAt,
          },
          201,
        )
      },
    )
    .post(
      '/media-objects/:id/complete-upload',
      apiValidator('param', MediaObjectParamsSchema),
      apiValidator('json', CompletePresignedMediaUploadSchema),
      async (c) => {
        const actor = await requireAuthActor(c, accountsService)
        const { id } = c.req.valid('param')
        const payload = c.req.valid('json')
        const mediaObject = await mediaObjectService.completePresignedUpload({
          accountId: actor.accountId,
          mediaObjectId: id,
          storageKey: payload.storageKey,
        })
        return c.json(MediaObjectResponseSchema.parse({ item: mediaObject }))
      },
    )
