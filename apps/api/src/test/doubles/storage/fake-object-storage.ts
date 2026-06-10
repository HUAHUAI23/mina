
import { ObjectStorageReadLimitError } from '../../../lib/storage/object-storage'
import type {
  CreatePresignedGetUrlInput,
  CreatePresignedPutUrlInput,
  DeleteAccountObjectInput,
  GetAccountObjectInput,
  ObjectStorage,
  ObjectStorageBody,
  PresignedPutObjectUrl,
  PutAccountObjectInput,
  StoredObjectData,
  StoredObject,
} from '../../../lib/storage/object-storage'
import { assertAccountStorageKey, buildAccountStorageKey } from '../../../lib/storage/storage-key'

interface StoredObjectValue {
  body: ObjectStorageBody
  contentType?: string
  metadata?: Record<string, string>
}

export class FakeObjectStorage implements ObjectStorage {
  readonly #bucket: string
  readonly #objects = new Map<string, StoredObjectValue>()
  readonly #rootPrefix: string

  constructor(bucket = 'mina-test-storage', rootPrefix = 'users') {
    this.#bucket = bucket
    this.#rootPrefix = rootPrefix
  }

  async createPresignedGetUrl(input: CreatePresignedGetUrlInput): Promise<string> {
    assertAccountStorageKey(input.accountId, input.key, this.#rootPrefix)
    return this.objectUrl(input.key)
  }

  async createPresignedPutUrl(input: CreatePresignedPutUrlInput): Promise<PresignedPutObjectUrl> {
    const key = buildAccountStorageKey({
      accountId: input.accountId,
      objectName: input.objectName,
      rootPrefix: this.#rootPrefix,
      scope: input.scope,
    })
    return {
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000).toISOString(),
      key,
      url: this.objectUrl(key),
    }
  }

  async deleteObject(input: DeleteAccountObjectInput): Promise<void> {
    assertAccountStorageKey(input.accountId, input.key, this.#rootPrefix)
    this.#objects.delete(input.key)
  }

  async getObject(input: GetAccountObjectInput): Promise<StoredObjectData> {
    assertAccountStorageKey(input.accountId, input.key, this.#rootPrefix)
    const stored = this.#objects.get(input.key)
    if (!stored) {
      throw new Error('Stored object not found.')
    }
    const body = await objectStorageBodyToBytes(stored.body)
    if (input.maxBytes !== undefined && body.byteLength > input.maxBytes) {
      throw new ObjectStorageReadLimitError()
    }
    return {
      body,
      byteSize: body.byteLength,
      ...(stored.contentType ? { contentType: stored.contentType } : {}),
    }
  }

  async putObject(input: PutAccountObjectInput): Promise<StoredObject> {
    const key = buildAccountStorageKey({
      accountId: input.accountId,
      objectName: input.objectName,
      rootPrefix: this.#rootPrefix,
      scope: input.scope,
    })
    this.#objects.set(key, {
      body: input.body,
      ...(input.contentType ? { contentType: input.contentType } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    })

    return {
      bucket: this.#bucket,
      key,
      url: this.objectUrl(key),
    }
  }

  getObjectForTest(key: string): { body: ObjectStorageBody; contentType?: string; metadata?: Record<string, string> } | undefined {
    return this.#objects.get(key)
  }

  private objectUrl(key: string): string {
    return `fake://${this.#bucket}/${key}`
  }
}

const objectStorageBodyToBytes = async (body: ObjectStorageBody): Promise<Uint8Array> => {
  if (body instanceof Uint8Array) {
    return body
  }
  if (typeof body === 'string') {
    return new TextEncoder().encode(body)
  }
  if (body instanceof Blob) {
    return new Uint8Array(await body.arrayBuffer())
  }
  const chunks: Uint8Array[] = []
  const reader = body.getReader()
  while (true) {
    const result = await reader.read()
    if (result.done) {
      break
    }
    chunks.push(result.value)
  }
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}
