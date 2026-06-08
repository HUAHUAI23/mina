import {
  AssetFolderListResponseSchema,
  AssetFolderResponseSchema,
  AssetLibraryFolderParamsSchema,
  AssetLibraryItemParamsSchema,
  AssetLibraryItemResponseSchema,
  AssetLibraryListResponseSchema,
  AssetTagListResponseSchema,
  AssetTagParamsSchema,
  AssetTagResponseSchema,
  CreateAssetFolderWithItemsSchema,
  CreateAssetFolderSchema,
  CreateAssetFromMediaObjectSchema,
  CreateAssetTagSchema,
  DeleteAssetFolderResponseSchema,
  DeleteAssetResponseSchema,
  DeleteAssetTagResponseSchema,
  ListAssetFoldersQuerySchema,
  ListAssetLibraryItemsQuerySchema,
  ListAssetTagsQuerySchema,
  UpdateAssetFolderSchema,
  UpdateAssetLibraryItemSchema,
  UpdateAssetTagSchema,
  UploadAssetFormSchema,
  UseAssetResponseSchema,
} from '@mina/contracts/modules/assets'
import type { ApiValidationIssue } from '@mina/contracts/schemas/api-error'
import type { ResourceKind } from '@mina/contracts/modules/tasks'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'

import { apiEnv } from '../../config/env'
import { HttpError } from '../../lib/http/http-error'
import { apiValidator } from '../../lib/http/validation'
import { requireAuthActor } from '../accounts/auth-middleware'
import { resourceKindFromMimeType } from '../media/media-type'
import type { AccountsService } from '../accounts/accounts.service'
import type { AssetLibraryService } from './asset-library.service'

const formValue = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

const formValues = (value: unknown[]): string[] =>
  value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())

const parseTagIds = (form: FormData): string[] =>
  formValues(form.getAll('tagIds')).flatMap((value) => value.split(',').map((item) => item.trim()).filter(Boolean))

const ASSET_UPLOAD_MULTIPART_OVERHEAD_BYTES = 1024 * 1024

const requestContentLength = (value: string | undefined): number | undefined => {
  if (!value?.trim() || !/^\d+$/.test(value.trim())) {
    return undefined
  }
  const length = Number(value)
  return Number.isSafeInteger(length) ? length : undefined
}

const assertUploadRequestWithinLimit = (contentLengthHeader: string | undefined): void => {
  const contentLength = requestContentLength(contentLengthHeader)
  if (contentLength === undefined) {
    return
  }
  if (contentLength > apiEnv.mediaUploadMaxBytes + ASSET_UPLOAD_MULTIPART_OVERHEAD_BYTES) {
    throw uploadTooLargeError()
  }
}

const uploadTooLargeError = (): HttpError =>
  new HttpError(413, 'MEDIA_UPLOAD_TOO_LARGE', {
    fallbackMessage: 'Media upload is too large.',
    messageKey: 'api_error_media_upload_too_large',
  })

type DetectedAssetFileType = {
  kind: ResourceKind
  mimeType: string
}

const startsWithBytes = (body: Uint8Array, bytes: number[]): boolean =>
  body.length >= bytes.length && bytes.every((byte, index) => body[index] === byte)

const asciiAt = (body: Uint8Array, offset: number, text: string): boolean =>
  body.length >= offset + text.length && [...text].every((char, index) => body[offset + index] === char.charCodeAt(0))

const detectAssetFileType = (body: Uint8Array, declaredKind?: ResourceKind): DetectedAssetFileType | undefined => {
  if (startsWithBytes(body, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: 'image', mimeType: 'image/png' }
  if (startsWithBytes(body, [0xff, 0xd8, 0xff])) return { kind: 'image', mimeType: 'image/jpeg' }
  if (asciiAt(body, 0, 'GIF87a') || asciiAt(body, 0, 'GIF89a')) return { kind: 'image', mimeType: 'image/gif' }
  if (asciiAt(body, 0, 'RIFF') && asciiAt(body, 8, 'WEBP')) return { kind: 'image', mimeType: 'image/webp' }
  if (asciiAt(body, 4, 'ftyp')) {
    return declaredKind === 'audio'
      ? { kind: 'audio', mimeType: 'audio/mp4' }
      : { kind: 'video', mimeType: 'video/mp4' }
  }
  if (asciiAt(body, 0, 'ID3') || startsWithBytes(body, [0xff, 0xfb]) || startsWithBytes(body, [0xff, 0xf3]) || startsWithBytes(body, [0xff, 0xf2])) {
    return { kind: 'audio', mimeType: 'audio/mpeg' }
  }
  if (asciiAt(body, 0, 'RIFF') && asciiAt(body, 8, 'WAVE')) return { kind: 'audio', mimeType: 'audio/wav' }
  if (asciiAt(body, 0, 'OggS')) {
    return declaredKind === 'video'
      ? { kind: 'video', mimeType: 'video/ogg' }
      : { kind: 'audio', mimeType: 'audio/ogg' }
  }
  if (asciiAt(body, 0, 'fLaC')) return { kind: 'audio', mimeType: 'audio/flac' }
  if (startsWithBytes(body, [0x1a, 0x45, 0xdf, 0xa3])) {
    return declaredKind === 'audio'
      ? { kind: 'audio', mimeType: 'audio/webm' }
      : { kind: 'video', mimeType: 'video/webm' }
  }
  return undefined
}

const zodIssuesToApiIssues = (
  issues: Array<{ code: string; message: string; path: PropertyKey[] }>,
): ApiValidationIssue[] =>
  issues.map((issue) => ({
    code: issue.code.toUpperCase(),
    message: issue.message,
    path: issue.path.filter((segment): segment is string | number => typeof segment === 'string' || typeof segment === 'number'),
  }))

export const createAssetLibraryRoutes = (
  assetLibraryService: AssetLibraryService,
  accountsService: AccountsService,
): Hono =>
  new Hono()
    .get('/', apiValidator('query', ListAssetLibraryItemsQuerySchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      return c.json(AssetLibraryListResponseSchema.parse(await assetLibraryService.listLibrary(actor.accountId, c.req.valid('query'))))
    })
    .post(
      '/upload',
      async (c, next) => {
        await requireAuthActor(c, accountsService)
        await next()
      },
      bodyLimit({
        maxSize: apiEnv.mediaUploadMaxBytes + ASSET_UPLOAD_MULTIPART_OVERHEAD_BYTES,
        onError: () => {
          throw uploadTooLargeError()
        },
      }),
      async (c) => {
        const actor = await requireAuthActor(c, accountsService)
        assertUploadRequestWithinLimit(c.req.header('content-length'))
        const form = await c.req.formData()
        const file = form.get('file')
        if (!(file instanceof File)) {
          throw new HttpError(422, 'MEDIA_FILE_REQUIRED', {
            fallbackMessage: 'A file field is required.',
            messageKey: 'api_error_media_file_required',
          })
        }
        if (file.size > apiEnv.mediaUploadMaxBytes) {
          throw uploadTooLargeError()
        }
        const parsedForm = UploadAssetFormSchema.safeParse({
          description: formValue(form.get('description')),
          displayName: formValue(form.get('displayName')),
          folderId: formValue(form.get('folderId')) ?? null,
          homeProjectId: formValue(form.get('homeProjectId')) ?? null,
          kind: formValue(form.get('kind')),
          tagIds: parseTagIds(form),
        })
        if (!parsedForm.success) {
          throw new HttpError(400, 'VALIDATION_FAILED', {
            fallbackMessage: 'The request is invalid.',
            issues: zodIssuesToApiIssues(parsedForm.error.issues),
            messageKey: 'api_error_validation_failed',
          })
        }
        const body = new Uint8Array(await file.arrayBuffer())
        const fileMimeKind = resourceKindFromMimeType(file.type)
        const detectedType = detectAssetFileType(body, fileMimeKind ?? parsedForm.data.kind)
        if (!detectedType) {
          throw new HttpError(415, 'MEDIA_TYPE_UNSUPPORTED', {
            fallbackMessage: 'Media MIME type is not supported.',
            messageKey: 'api_error_media_type_unsupported',
          })
        }
        if ((fileMimeKind && fileMimeKind !== detectedType.kind) || (parsedForm.data.kind && parsedForm.data.kind !== detectedType.kind)) {
          throw new HttpError(415, 'MEDIA_TYPE_UNSUPPORTED', {
            fallbackMessage: 'Media MIME type is not supported.',
            messageKey: 'api_error_media_type_unsupported',
          })
        }
        const item = await assetLibraryService.createUploadedAsset({
          accountId: actor.accountId,
          addedByUserId: actor.userId,
          body,
          ...(parsedForm.data.description ? { description: parsedForm.data.description } : {}),
          ...(parsedForm.data.displayName ? { displayName: parsedForm.data.displayName } : {}),
          fileName: file.name,
          folderId: parsedForm.data.folderId ?? null,
          homeProjectId: parsedForm.data.homeProjectId ?? null,
          kind: detectedType.kind,
          mimeType: detectedType.mimeType,
          tagIds: parsedForm.data.tagIds,
        })
        return c.json(AssetLibraryItemResponseSchema.parse({ item }), 201)
      },
    )
    .post('/from-media-object', apiValidator('json', CreateAssetFromMediaObjectSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const item = await assetLibraryService.createFromMediaObject(actor.accountId, actor.userId, c.req.valid('json'))
      return c.json(AssetLibraryItemResponseSchema.parse({ item }), 201)
    })
    .get('/folders', apiValidator('query', ListAssetFoldersQuerySchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      return c.json(AssetFolderListResponseSchema.parse(await assetLibraryService.listFolders(actor.accountId, c.req.valid('query'))))
    })
    .post('/folders', apiValidator('json', CreateAssetFolderSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      return c.json(
        AssetFolderResponseSchema.parse({ item: await assetLibraryService.createFolder(actor.accountId, actor.userId, c.req.valid('json')) }),
        201,
      )
    })
    .post('/folders/from-items', apiValidator('json', CreateAssetFolderWithItemsSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      return c.json(
        AssetFolderResponseSchema.parse({ item: await assetLibraryService.createFolderWithItems(actor.accountId, actor.userId, c.req.valid('json')) }),
        201,
      )
    })
    .patch(
      '/folders/:folderId',
      apiValidator('param', AssetLibraryFolderParamsSchema),
      apiValidator('json', UpdateAssetFolderSchema),
      async (c) => {
        const actor = await requireAuthActor(c, accountsService)
        const { folderId } = c.req.valid('param')
        return c.json(
          AssetFolderResponseSchema.parse({ item: await assetLibraryService.updateFolder(actor.accountId, folderId, c.req.valid('json')) }),
        )
      },
    )
    .delete('/folders/:folderId', apiValidator('param', AssetLibraryFolderParamsSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const { folderId } = c.req.valid('param')
      await assetLibraryService.deleteFolder(actor.accountId, folderId)
      return c.json(DeleteAssetFolderResponseSchema.parse({ success: true }))
    })
    .get('/tags', apiValidator('query', ListAssetTagsQuerySchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      return c.json(AssetTagListResponseSchema.parse(await assetLibraryService.listTags(actor.accountId, c.req.valid('query'))))
    })
    .post('/tags', apiValidator('json', CreateAssetTagSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      return c.json(
        AssetTagResponseSchema.parse({ item: await assetLibraryService.createTag(actor.accountId, c.req.valid('json')) }),
        201,
      )
    })
    .patch(
      '/tags/:tagId',
      apiValidator('param', AssetTagParamsSchema),
      apiValidator('json', UpdateAssetTagSchema),
      async (c) => {
        const actor = await requireAuthActor(c, accountsService)
        const { tagId } = c.req.valid('param')
        return c.json(
          AssetTagResponseSchema.parse({ item: await assetLibraryService.updateTag(actor.accountId, tagId, c.req.valid('json')) }),
        )
      },
    )
    .delete('/tags/:tagId', apiValidator('param', AssetTagParamsSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const { tagId } = c.req.valid('param')
      await assetLibraryService.deleteTag(actor.accountId, tagId)
      return c.json(DeleteAssetTagResponseSchema.parse({ success: true }))
    })
    .get('/:id', apiValidator('param', AssetLibraryItemParamsSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const { id } = c.req.valid('param')
      return c.json(AssetLibraryItemResponseSchema.parse({ item: await assetLibraryService.getItem(actor.accountId, id) }))
    })
    .patch(
      '/:id',
      apiValidator('param', AssetLibraryItemParamsSchema),
      apiValidator('json', UpdateAssetLibraryItemSchema),
      async (c) => {
        const actor = await requireAuthActor(c, accountsService)
        const { id } = c.req.valid('param')
        return c.json(
          AssetLibraryItemResponseSchema.parse({ item: await assetLibraryService.updateItem(actor.accountId, id, c.req.valid('json')) }),
        )
      },
    )
    .delete('/:id', apiValidator('param', AssetLibraryItemParamsSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const { id } = c.req.valid('param')
      await assetLibraryService.deleteItem(actor.accountId, id)
      return c.json(DeleteAssetResponseSchema.parse({ success: true }))
    })
    .post('/:id/use', apiValidator('param', AssetLibraryItemParamsSchema), async (c) => {
      const actor = await requireAuthActor(c, accountsService)
      const { id } = c.req.valid('param')
      return c.json(UseAssetResponseSchema.parse({ item: await assetLibraryService.useItem(actor.accountId, id) }))
    })
    .post(
      '/:id/tags/:tagId',
      apiValidator('param', AssetLibraryItemParamsSchema.merge(AssetTagParamsSchema)),
      async (c) => {
        const actor = await requireAuthActor(c, accountsService)
        const { id, tagId } = c.req.valid('param')
        return c.json(AssetLibraryItemResponseSchema.parse({ item: await assetLibraryService.addTag(actor.accountId, id, tagId) }))
      },
    )
    .delete(
      '/:id/tags/:tagId',
      apiValidator('param', AssetLibraryItemParamsSchema.merge(AssetTagParamsSchema)),
      async (c) => {
        const actor = await requireAuthActor(c, accountsService)
        const { id, tagId } = c.req.valid('param')
        return c.json(AssetLibraryItemResponseSchema.parse({ item: await assetLibraryService.removeTag(actor.accountId, id, tagId) }))
      },
    )
