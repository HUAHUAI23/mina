import { describe, expect, test } from 'bun:test'
import {
  AssetFolderListResponseSchema,
  AssetFolderResponseSchema,
  AssetLibraryItemResponseSchema,
  AssetLibraryListResponseSchema,
  AssetTagListResponseSchema,
  AssetTagResponseSchema,
} from '@mina/contracts/modules/assets'
import { MediaObjectResponseSchema } from '@mina/contracts/modules/media/media-object'

import { createTestApp } from '../../test/app'

const pngBytes = new Uint8Array([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  0x00,
  0x00,
  0x00,
  0x0d,
  0x49,
  0x48,
  0x44,
  0x52,
])

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
      email: `assets-${crypto.randomUUID()}@example.com`,
      password: 'correct horse battery staple',
      username: `assets_${crypto.randomUUID().slice(0, 8)}`,
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
  expect(response.status).toBe(201)
  return readAuthToken(await response.json())
}

const uploadAsset = async (
  app: ReturnType<typeof createTestApp>,
  token: string,
  input: {
    description?: string
    displayName: string
    folderId?: string
    tagIds?: string[]
  },
) => {
  const form = new FormData()
  form.set('file', new File([pngBytes], `${input.displayName}.png`, { type: 'image/png' }))
  form.set('displayName', input.displayName)
  if (input.description) form.set('description', input.description)
  if (input.folderId) form.set('folderId', input.folderId)
  if (input.tagIds) form.set('tagIds', input.tagIds.join(','))
  const response = await app.request('/api/assets/upload', {
    body: form,
    headers: { Authorization: `Bearer ${token}` },
    method: 'POST',
  })
  expect(response.status).toBe(201)
  return AssetLibraryItemResponseSchema.parse(await response.json()).item
}

describe('asset library routes', () => {
  test('initializes system tags for an account', async () => {
    const app = createTestApp()
    const token = await register(app)

    const response = await app.request('/api/assets/tags', {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(response.status).toBe(200)
    const payload = AssetTagListResponseSchema.parse(await response.json())
    expect(payload.items.map((tag) => tag.systemKey)).toEqual([
      'other',
      'person',
      'scene',
      'object',
      'style',
      'sound_effect',
    ])
  })

  test('uploads assets and searches by tag, folder, source text, description, and display name', async () => {
    const app = createTestApp()
    const token = await register(app)

    const tagsResponse = await app.request('/api/assets/tags', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const tags = AssetTagListResponseSchema.parse(await tagsResponse.json()).items
    const personTag = tags.find((tag) => tag.systemKey === 'person')
    const sceneTag = tags.find((tag) => tag.systemKey === 'scene')
    expect(personTag).toBeDefined()
    expect(sceneTag).toBeDefined()

    const folderResponse = await app.request('/api/assets/folders', {
      body: JSON.stringify({ name: '角色参考' }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
    expect(folderResponse.status).toBe(201)
    const createdFolder = AssetFolderResponseSchema.parse(await folderResponse.json()).item
    const folderId = createdFolder.id
    expect(createdFolder.sortOrder).toBeLessThanOrEqual(2_147_483_647)

    const renameFolderResponse = await app.request(`/api/assets/folders/${folderId}`, {
      body: JSON.stringify({ name: '主角参考' }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'PATCH',
    })
    expect(renameFolderResponse.status).toBe(200)
    const renamedFolder = AssetFolderResponseSchema.parse(await renameFolderResponse.json()).item
    expect(renamedFolder.name).toBe('主角参考')

    const asset = await uploadAsset(app, token, {
      description: 'Beach character reference from Campaign Alpha.',
      displayName: '海边人物参考',
      folderId,
      tagIds: personTag ? [personTag.id] : [],
    })
    expect(asset.folder?.name).toBe('主角参考')

    const searchResponse = await app.request(`/api/assets?q=${encodeURIComponent('Campaign Alpha')}&tagIds=${personTag?.id ?? ''}&folderId=${folderId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(searchResponse.status).toBe(200)
    const search = AssetLibraryListResponseSchema.parse(await searchResponse.json())
    expect(search.folders).toEqual([])
    expect(search.items.map((item) => item.id)).toEqual([asset.id])

    const tagFilterResponse = await app.request(`/api/assets?tagIds=${personTag?.id ?? ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(tagFilterResponse.status).toBe(200)
    const tagFilter = AssetLibraryListResponseSchema.parse(await tagFilterResponse.json())
    expect(tagFilter.folders).toEqual([])
    expect(tagFilter.items.map((item) => item.id)).toContain(asset.id)

    const emptyTagFilterResponse = await app.request(`/api/assets?tagIds=${sceneTag?.id ?? ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(emptyTagFilterResponse.status).toBe(200)
    const emptyTagFilter = AssetLibraryListResponseSchema.parse(await emptyTagFilterResponse.json())
    expect(emptyTagFilter.folders).toEqual([])
    expect(emptyTagFilter.items).toEqual([])

    const folderSearchResponse = await app.request(`/api/assets/folders?q=${encodeURIComponent('主角')}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const folders = AssetFolderListResponseSchema.parse(await folderSearchResponse.json())
    expect(folders.items.map((folder) => folder.id)).toEqual([folderId])

    const rootSearchResponse = await app.request(`/api/assets?q=${encodeURIComponent('主角')}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const rootSearch = AssetLibraryListResponseSchema.parse(await rootSearchResponse.json())
    expect(rootSearch.folders.map((folder) => folder.id)).toEqual([folderId])
    expect(rootSearch.items.map((item) => item.id)).not.toContain(asset.id)
  })

  test('searches and filters assets by source project and source type', async () => {
    const app = createTestApp()
    const token = await register(app)
    const uploaded = await uploadAsset(app, token, {
      displayName: 'Canvas source media',
    })

    const fromMediaResponse = await app.request('/api/assets/from-media-object', {
      body: JSON.stringify({
        displayName: 'Hero frame output',
        mediaObjectId: uploaded.mediaObjectId,
        sourceProjectId: 'project_campaign_alpha',
        sourceProjectName: 'Campaign Alpha',
        sourceRef: {
          canvasName: 'Storyboard board',
          nodeId: 'node_hero_frame',
        },
        sourceType: 'workflow_output',
        tagIds: [],
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
    expect(fromMediaResponse.status).toBe(201)
    const sourced = AssetLibraryItemResponseSchema.parse(await fromMediaResponse.json()).item

    const sourceProjectSearchResponse = await app.request(`/api/assets?q=${encodeURIComponent('Campaign Alpha')}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const sourceProjectSearch = AssetLibraryListResponseSchema.parse(await sourceProjectSearchResponse.json())
    expect(sourceProjectSearch.items.map((item) => item.id)).toContain(sourced.id)

    const sourceRefSearchResponse = await app.request(`/api/assets?q=${encodeURIComponent('Storyboard board')}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const sourceRefSearch = AssetLibraryListResponseSchema.parse(await sourceRefSearchResponse.json())
    expect(sourceRefSearch.items.map((item) => item.id)).toContain(sourced.id)

    const sourceTypeFilterResponse = await app.request('/api/assets?sourceType=workflow_output', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const sourceTypeFilter = AssetLibraryListResponseSchema.parse(await sourceTypeFilterResponse.json())
    expect(sourceTypeFilter.items.map((item) => item.id)).toContain(sourced.id)
    expect(sourceTypeFilter.items.every((item) => item.sourceType === 'workflow_output')).toBe(true)
  })

  test('rejects oversized source snapshots for assets created from media objects', async () => {
    const app = createTestApp()
    const token = await register(app)
    const uploaded = await uploadAsset(app, token, {
      displayName: 'Source snapshot media',
    })

    const response = await app.request('/api/assets/from-media-object', {
      body: JSON.stringify({
        mediaObjectId: uploaded.mediaObjectId,
        sourceRef: {
          prompt: 'x'.repeat(16_384),
        },
        sourceType: 'workflow_output',
        tagIds: [],
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })

    expect(response.status).toBe(400)
  })

  test('rejects client-controlled local or system source types for media object assets', async () => {
    const app = createTestApp()
    const token = await register(app)
    const uploaded = await uploadAsset(app, token, {
      displayName: 'Source type media',
    })

    for (const sourceType of ['local_upload', 'system']) {
      const response = await app.request('/api/assets/from-media-object', {
        body: JSON.stringify({
          mediaObjectId: uploaded.mediaObjectId,
          sourceType,
          tagIds: [],
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      })

      expect(response.status).toBe(400)
    }
  })

  test('parses false favoriteOnly query without enabling the favorites filter', async () => {
    const app = createTestApp()
    const token = await register(app)
    const asset = await uploadAsset(app, token, { displayName: 'Plain asset' })

    const falseFavoriteResponse = await app.request('/api/assets?favoriteOnly=false', {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(falseFavoriteResponse.status).toBe(200)
    const falseFavoriteList = AssetLibraryListResponseSchema.parse(await falseFavoriteResponse.json())
    expect(falseFavoriteList.items.map((item) => item.id)).toContain(asset.id)

    const trueFavoriteResponse = await app.request('/api/assets?favoriteOnly=true', {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(trueFavoriteResponse.status).toBe(200)
    const trueFavoriteList = AssetLibraryListResponseSchema.parse(await trueFavoriteResponse.json())
    expect(trueFavoriteList.items.map((item) => item.id)).not.toContain(asset.id)
  })

  test('parses repeated and comma-separated tagIds query filters with a bounded size', async () => {
    const app = createTestApp()
    const token = await register(app)
    const tagsResponse = await app.request('/api/assets/tags', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const tags = AssetTagListResponseSchema.parse(await tagsResponse.json()).items
    const personTag = tags.find((tag) => tag.systemKey === 'person')
    const sceneTag = tags.find((tag) => tag.systemKey === 'scene')
    expect(personTag).toBeDefined()
    expect(sceneTag).toBeDefined()
    const asset = await uploadAsset(app, token, {
      displayName: 'Bounded tag query asset',
      tagIds: [personTag?.id ?? '', sceneTag?.id ?? ''],
    })

    const params = new URLSearchParams()
    params.append('tagIds', personTag?.id ?? '')
    params.append('tagIds', `${sceneTag?.id},${personTag?.id}`)
    const response = await app.request(`/api/assets?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(response.status).toBe(200)
    const list = AssetLibraryListResponseSchema.parse(await response.json())
    expect(list.items.map((item) => item.id)).toContain(asset.id)

    const tooManyParams = new URLSearchParams()
    tooManyParams.set('tagIds', Array.from({ length: 21 }, (_, index) => `tag_${index}`).join(','))
    const tooManyResponse = await app.request(`/api/assets?${tooManyParams.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(tooManyResponse.status).toBe(400)
  })

  test('stores local asset uploads with account asset-library media purpose', async () => {
    const app = createTestApp()
    const token = await register(app)
    const asset = await uploadAsset(app, token, { displayName: 'Account asset upload' })

    const mediaResponse = await app.request(`/api/media-objects/${asset.mediaObjectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(mediaResponse.status).toBe(200)
    const media = MediaObjectResponseSchema.parse(await mediaResponse.json()).item
    expect(media.purpose).toBe('asset_library')
    expect(media.retention).toBe('library')
  })

  test('accepts repeated comma-separated tagIds fields when uploading an asset', async () => {
    const app = createTestApp()
    const token = await register(app)
    const tagsResponse = await app.request('/api/assets/tags', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const tags = AssetTagListResponseSchema.parse(await tagsResponse.json()).items
    const personTag = tags.find((tag) => tag.systemKey === 'person')
    const sceneTag = tags.find((tag) => tag.systemKey === 'scene')
    expect(personTag).toBeDefined()
    expect(sceneTag).toBeDefined()
    const personTagId = personTag?.id ?? ''
    const sceneTagId = sceneTag?.id ?? ''

    const form = new FormData()
    form.set('file', new File([pngBytes], 'Tagged upload.png', { type: 'image/png' }))
    form.set('displayName', 'Tagged upload')
    form.append('tagIds', `${personTagId},${sceneTagId}`)
    form.append('tagIds', personTagId)

    const response = await app.request('/api/assets/upload', {
      body: form,
      headers: { Authorization: `Bearer ${token}` },
      method: 'POST',
    })

    expect(response.status).toBe(201)
    const asset = AssetLibraryItemResponseSchema.parse(await response.json()).item
    expect(asset.tags.map((tag) => tag.id).sort()).toEqual([personTagId, sceneTagId].sort())
  })

  test('does not match assets through deleted tags', async () => {
    const app = createTestApp()
    const token = await register(app)
    const tagResponse = await app.request('/api/assets/tags', {
      body: JSON.stringify({ name: 'Temporary tag' }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
    expect(tagResponse.status).toBe(201)
    const tag = AssetTagResponseSchema.parse(await tagResponse.json()).item
    const asset = await uploadAsset(app, token, {
      displayName: 'Tagged then deleted',
      tagIds: [tag.id],
    })

    const deleteTagResponse = await app.request(`/api/assets/tags/${tag.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      method: 'DELETE',
    })
    expect(deleteTagResponse.status).toBe(200)

    const listResponse = await app.request(`/api/assets?tagIds=${encodeURIComponent(tag.id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(listResponse.status).toBe(200)
    const list = AssetLibraryListResponseSchema.parse(await listResponse.json())
    expect(list.items.map((item) => item.id)).not.toContain(asset.id)
  })

  test('does not allow removing tags from another account', async () => {
    const app = createTestApp()
    const ownerToken = await register(app)
    const otherToken = await register(app)
    const ownerAsset = await uploadAsset(app, ownerToken, {
      displayName: 'Owner asset',
    })

    const otherTagsResponse = await app.request('/api/assets/tags', {
      headers: { Authorization: `Bearer ${otherToken}` },
    })
    expect(otherTagsResponse.status).toBe(200)
    const otherTag = AssetTagListResponseSchema.parse(await otherTagsResponse.json()).items.find((tag) => tag.systemKey === 'person')
    expect(otherTag).toBeDefined()

    const response = await app.request(`/api/assets/${ownerAsset.id}/tags/${otherTag?.id ?? ''}`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
      method: 'DELETE',
    })

    expect(response.status).toBe(404)
    expect((await response.json() as { error: { code: string } }).error.code).toBe('ASSET_TAG_NOT_FOUND')
  })

  test('deleting a folder returns its assets to the unfiled library', async () => {
    const app = createTestApp()
    const token = await register(app)
    const folderResponse = await app.request('/api/assets/folders', {
      body: JSON.stringify({ name: 'Sound picks' }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
    const folderId = (await folderResponse.json() as { item: { id: string } }).item.id
    const asset = await uploadAsset(app, token, {
      displayName: 'Door hit',
      folderId,
    })

    const deleteResponse = await app.request(`/api/assets/folders/${folderId}`, {
      headers: { Authorization: `Bearer ${token}` },
      method: 'DELETE',
    })
    expect(deleteResponse.status).toBe(200)

    const itemResponse = await app.request(`/api/assets/${asset.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(itemResponse.status).toBe(200)
    const item = AssetLibraryItemResponseSchema.parse(await itemResponse.json()).item
    expect(item.folderId).toBeUndefined()
    expect(item.folder).toBeUndefined()

    const recreateResponse = await app.request('/api/assets/folders', {
      body: JSON.stringify({ name: 'Sound picks' }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
    expect(recreateResponse.status).toBe(201)
    const recreated = AssetFolderResponseSchema.parse(await recreateResponse.json()).item
    expect(recreated.name).toBe('Sound picks')
    expect(recreated.id).not.toBe(folderId)
  })

  test('hides archived assets from list, detail, and use flows', async () => {
    const app = createTestApp()
    const token = await register(app)
    const asset = await uploadAsset(app, token, { displayName: 'Archived asset' })

    const archiveResponse = await app.request(`/api/assets/${asset.id}`, {
      body: JSON.stringify({ status: 'archived' }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'PATCH',
    })
    expect(archiveResponse.status).toBe(200)
    expect(AssetLibraryItemResponseSchema.parse(await archiveResponse.json()).item.status).toBe('archived')

    const listResponse = await app.request('/api/assets', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(listResponse.status).toBe(200)
    const list = AssetLibraryListResponseSchema.parse(await listResponse.json())
    expect(list.items.map((item) => item.id)).not.toContain(asset.id)

    const detailResponse = await app.request(`/api/assets/${asset.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(detailResponse.status).toBe(404)

    const useResponse = await app.request(`/api/assets/${asset.id}/use`, {
      headers: { Authorization: `Bearer ${token}` },
      method: 'POST',
    })
    expect(useResponse.status).toBe(404)
  })

  test('creates a folder from assets atomically', async () => {
    const app = createTestApp()
    const token = await register(app)
    const source = await uploadAsset(app, token, { displayName: 'Character A' })
    const target = await uploadAsset(app, token, { displayName: 'Character B' })

    const response = await app.request('/api/assets/folders/from-items', {
      body: JSON.stringify({ assetItemIds: [source.id, target.id], name: 'Characters' }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })

    expect(response.status).toBe(201)
    const folder = AssetFolderResponseSchema.parse(await response.json()).item
    expect(folder.assetCount).toBe(2)

    const listResponse = await app.request(`/api/assets?folderId=${folder.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const list = AssetLibraryListResponseSchema.parse(await listResponse.json())
    expect(list.items.map((item) => item.id).sort()).toEqual([source.id, target.id].sort())
  })

  test('paginates asset search results', async () => {
    const app = createTestApp()
    const token = await register(app)
    await uploadAsset(app, token, { displayName: 'Pagination one' })
    await uploadAsset(app, token, { displayName: 'Pagination two' })
    await uploadAsset(app, token, { displayName: 'Pagination three' })

    const firstResponse = await app.request('/api/assets?q=Pagination&limit=2', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(firstResponse.status).toBe(200)
    const first = AssetLibraryListResponseSchema.parse(await firstResponse.json())
    expect(first.items).toHaveLength(2)
    expect(first.nextCursor).toBeDefined()

    const secondResponse = await app.request(`/api/assets?q=Pagination&limit=2&cursor=${encodeURIComponent(first.nextCursor ?? '')}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(secondResponse.status).toBe(200)
    const second = AssetLibraryListResponseSchema.parse(await secondResponse.json())
    expect(second.items).toHaveLength(1)
    expect(second.nextCursor).toBeUndefined()
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(3)
  })

  test('rejects uploads when the file signature does not match supported media', async () => {
    const app = createTestApp()
    const token = await register(app)
    const form = new FormData()
    form.set('file', new File(['asset body'], 'not-image.png', { type: 'image/png' }))
    form.set('displayName', 'Not an image')

    const response = await app.request('/api/assets/upload', {
      body: form,
      headers: { Authorization: `Bearer ${token}` },
      method: 'POST',
    })

    expect(response.status).toBe(415)
  })

  test('rejects obviously oversized upload requests before trusting multipart parsing', async () => {
    const app = createTestApp()
    const token = await register(app)

    const response = await app.request('/api/assets/upload', {
      body: 'too large',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Length': String((101 * 1024 * 1024) + 1),
        'Content-Type': 'multipart/form-data; boundary=asset-test',
      },
      method: 'POST',
    })

    expect(response.status).toBe(413)
  })

  test('tracks asset usage without changing media object identity', async () => {
    const app = createTestApp()
    const token = await register(app)
    const asset = await uploadAsset(app, token, {
      displayName: 'Reusable frame',
    })

    const useResponse = await app.request(`/api/assets/${asset.id}/use`, {
      headers: { Authorization: `Bearer ${token}` },
      method: 'POST',
    })

    expect(useResponse.status).toBe(200)
    const used = AssetLibraryItemResponseSchema.parse(await useResponse.json()).item
    expect(used.mediaObjectId).toBe(asset.mediaObjectId)
    expect(used.usageCount).toBe(1)
    expect(used.lastUsedAt).toBeDefined()
  })
})
