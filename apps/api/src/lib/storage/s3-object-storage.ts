import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { ObjectStorageReadLimitError } from './object-storage'
import type {
  CreatePresignedGetUrlInput,
  CreatePresignedPutUrlInput,
  DeleteAccountObjectInput,
  GetAccountObjectInput,
  ObjectStorage,
  PresignedPutObjectUrl,
  PutAccountObjectInput,
  StoredObjectData,
  StoredObject,
} from './object-storage'
import { assertAccountStorageKey, buildAccountStorageKey } from './storage-key'

export interface S3ObjectStorageConfig {
  accessKeyId?: string
  bucket: string
  endpoint?: string
  forcePathStyle?: boolean
  publicBaseUrl?: string
  region: string
  rootPrefix?: string
  secretAccessKey?: string
}

const DEFAULT_PRESIGNED_GET_CACHE_CONTROL = 'private, no-store, max-age=0'

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '')

const createS3ClientConfig = (config: S3ObjectStorageConfig): S3ClientConfig => ({
  region: config.region,
  ...(config.endpoint ? { endpoint: config.endpoint } : {}),
  ...(config.forcePathStyle !== undefined ? { forcePathStyle: config.forcePathStyle } : {}),
  ...(config.accessKeyId && config.secretAccessKey
    ? {
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      }
    : {}),
})

export class S3ObjectStorage implements ObjectStorage {
  readonly #bucket: string
  readonly #client: S3Client
  readonly #publicBaseUrl: string | undefined
  readonly #rootPrefix: string

  constructor(config: S3ObjectStorageConfig, client = new S3Client(createS3ClientConfig(config))) {
    this.#bucket = config.bucket
    this.#client = client
    this.#publicBaseUrl = config.publicBaseUrl ? trimTrailingSlash(config.publicBaseUrl) : undefined
    this.#rootPrefix = config.rootPrefix ?? 'users'
  }

  async createPresignedGetUrl(input: CreatePresignedGetUrlInput): Promise<string> {
    assertAccountStorageKey(input.accountId, input.key, this.#rootPrefix)
    return getSignedUrl(
      this.#client,
      new GetObjectCommand({
        Bucket: this.#bucket,
        Key: input.key,
        ResponseCacheControl: input.responseCacheControl ?? DEFAULT_PRESIGNED_GET_CACHE_CONTROL,
      }),
      { expiresIn: input.expiresInSeconds },
    )
  }

  async createPresignedPutUrl(input: CreatePresignedPutUrlInput): Promise<PresignedPutObjectUrl> {
    const key = buildAccountStorageKey({
      accountId: input.accountId,
      objectName: input.objectName,
      rootPrefix: this.#rootPrefix,
      scope: input.scope,
    })
    const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1000).toISOString()
    const url = await getSignedUrl(
      this.#client,
      new PutObjectCommand({
        Bucket: this.#bucket,
        Key: key,
        ...(input.contentType ? { ContentType: input.contentType } : {}),
      }),
      { expiresIn: input.expiresInSeconds },
    )

    return {
      expiresAt,
      key,
      url,
    }
  }

  async deleteObject(input: DeleteAccountObjectInput): Promise<void> {
    assertAccountStorageKey(input.accountId, input.key, this.#rootPrefix)
    await this.#client.send(
      new DeleteObjectCommand({
        Bucket: this.#bucket,
        Key: input.key,
      }),
    )
  }

  async getObject(input: GetAccountObjectInput): Promise<StoredObjectData> {
    assertAccountStorageKey(input.accountId, input.key, this.#rootPrefix)
    const response = await this.#client.send(
      new GetObjectCommand({
        Bucket: this.#bucket,
        Key: input.key,
      }),
    )
    if (input.maxBytes !== undefined && response.ContentLength !== undefined && response.ContentLength > input.maxBytes) {
      throw new ObjectStorageReadLimitError()
    }
    const body = response.Body ? await response.Body.transformToByteArray() : new Uint8Array()
    if (input.maxBytes !== undefined && body.byteLength > input.maxBytes) {
      throw new ObjectStorageReadLimitError()
    }
    return {
      body,
      byteSize: body.byteLength,
      ...(response.ContentType ? { contentType: response.ContentType } : {}),
    }
  }

  async putObject(input: PutAccountObjectInput): Promise<StoredObject> {
    const key = buildAccountStorageKey({
      accountId: input.accountId,
      objectName: input.objectName,
      rootPrefix: this.#rootPrefix,
      scope: input.scope,
    })
    await this.#client.send(
      new PutObjectCommand({
        Body: input.body,
        Bucket: this.#bucket,
        Key: key,
        ...(input.contentType ? { ContentType: input.contentType } : {}),
        ...(input.metadata ? { Metadata: input.metadata } : {}),
      }),
    )

    return {
      bucket: this.#bucket,
      key,
      url: this.objectUrl(key),
    }
  }

  private objectUrl(key: string): string {
    if (this.#publicBaseUrl) {
      return `${this.#publicBaseUrl}/${key}`
    }
    return `s3://${this.#bucket}/${key}`
  }
}
