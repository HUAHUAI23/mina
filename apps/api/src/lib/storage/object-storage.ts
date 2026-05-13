export type ObjectStorageBody = Blob | ReadableStream | string | Uint8Array

export type StorageObjectScope = 'assets' | 'task-inputs' | 'task-outputs' | 'temporary' | 'uploads'

export interface StoredObject {
  bucket: string
  key: string
  url: string
}

export interface PutAccountObjectInput {
  accountId: string
  body: ObjectStorageBody
  contentType?: string
  metadata?: Record<string, string>
  objectName: string
  scope: StorageObjectScope
}

export interface DeleteAccountObjectInput {
  accountId: string
  key: string
}

export interface CreatePresignedGetUrlInput {
  accountId: string
  expiresInSeconds: number
  key: string
}

export interface CreatePresignedPutUrlInput {
  accountId: string
  contentType?: string
  expiresInSeconds: number
  objectName: string
  scope: StorageObjectScope
}

export interface PresignedPutObjectUrl {
  expiresAt: string
  key: string
  url: string
}

export interface ObjectStorage {
  createPresignedGetUrl(input: CreatePresignedGetUrlInput): Promise<string>
  createPresignedPutUrl(input: CreatePresignedPutUrlInput): Promise<PresignedPutObjectUrl>
  deleteObject(input: DeleteAccountObjectInput): Promise<void>
  putObject(input: PutAccountObjectInput): Promise<StoredObject>
}
