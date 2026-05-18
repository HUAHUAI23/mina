import { apiEnv } from '../../config/env'
import type { ObjectStorage } from './object-storage'
import { S3ObjectStorage } from './s3-object-storage'

export const createObjectStorage = (): ObjectStorage => {
  if (!apiEnv.s3Bucket) {
    throw new Error('MINA_S3_BUCKET is required when MINA_STORAGE_DRIVER=s3.')
  }

  return new S3ObjectStorage({
    bucket: apiEnv.s3Bucket,
    region: apiEnv.s3Region,
    rootPrefix: apiEnv.storageRootPrefix,
    ...(apiEnv.s3AccessKeyId ? { accessKeyId: apiEnv.s3AccessKeyId } : {}),
    ...(apiEnv.s3Endpoint ? { endpoint: apiEnv.s3Endpoint } : {}),
    ...(apiEnv.s3PublicBaseUrl ? { publicBaseUrl: apiEnv.s3PublicBaseUrl } : {}),
    ...(apiEnv.s3SecretAccessKey ? { secretAccessKey: apiEnv.s3SecretAccessKey } : {}),
    forcePathStyle: apiEnv.s3ForcePathStyle,
  })
}
