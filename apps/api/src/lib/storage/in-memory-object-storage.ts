import type {
  CreatePresignedGetUrlInput,
  CreatePresignedPutUrlInput,
  DeleteAccountObjectInput,
  ObjectStorage,
  ObjectStorageBody,
  PresignedPutObjectUrl,
  PutAccountObjectInput,
  StoredObject,
} from './object-storage'
import { assertAccountStorageKey, buildAccountStorageKey } from './storage-key'

interface InMemoryStoredValue {
  body: ObjectStorageBody
  contentType?: string
  metadata?: Record<string, string>
}

export class InMemoryObjectStorage implements ObjectStorage {
  readonly #bucket: string
  readonly #objects = new Map<string, InMemoryStoredValue>()
  readonly #rootPrefix: string

  constructor(bucket = 'mina-memory-storage', rootPrefix = 'users') {
    this.#bucket = bucket
    this.#rootPrefix = rootPrefix
  }

  async createPresignedGetUrl(input: CreatePresignedGetUrlInput): Promise<string> {
    assertAccountStorageKey(input.accountId, input.key, this.#rootPrefix)
    return this.memoryUrl(input.key)
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
      url: this.memoryUrl(key),
    }
  }

  async deleteObject(input: DeleteAccountObjectInput): Promise<void> {
    assertAccountStorageKey(input.accountId, input.key, this.#rootPrefix)
    this.#objects.delete(input.key)
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
      url: this.memoryUrl(key),
    }
  }

  private memoryUrl(key: string): string {
    return `memory://${this.#bucket}/${key}`
  }
}
