import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

import { DEFAULT_DATABASE_URL } from './defaults'
import './load-env'

const DEFAULT_ALLOWED_ORIGIN = 'http://localhost:3000'
const DEFAULT_API_PORT = 3001
const DEFAULT_SCHEDULER_CRON = '*/5 * * * * *'
const DEFAULT_S3_REGION = 'us-east-1'
const DEFAULT_STORAGE_ROOT_PREFIX = 'users'
const DEFAULT_MEDIA_UPLOAD_MAX_BYTES = 100 * 1024 * 1024
const DEFAULT_TASK_MAX_RUNNING_SECONDS = 21_600
const DEFAULT_TASK_POLL_BATCH_SIZE = 25
const DEFAULT_TASK_POLL_DEFAULT_INTERVAL_SECONDS = 10
const DEFAULT_TASK_POLL_LEASE_SECONDS = 30
const DEFAULT_TASK_POLL_MAX_INTERVAL_SECONDS = 120
const DEFAULT_TASK_PROVIDER_ERROR_MAX_RETRIES = 8
const DEFAULT_PROVIDER_MEDIA_URL_EXPIRES_SECONDS = 14_400
const DEFAULT_GOOGLE_API_BASE_URL = 'https://generativelanguage.googleapis.com'
const DEFAULT_VOLCENGINE_ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'

const booleanEnvSchema = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true')

const optionalNonEmptyStringSchema = z.string().trim().min(1).optional()

const env = createEnv({
  server: {
    MINA_ALLOWED_ORIGIN: z.string().trim().min(1).default(DEFAULT_ALLOWED_ORIGIN),
    MINA_API_PORT: z.coerce.number().int().positive().default(DEFAULT_API_PORT),
    MINA_DATABASE_URL: z.url().default(DEFAULT_DATABASE_URL),
    GOOGLE_API_BASE_URL: z.url().default(DEFAULT_GOOGLE_API_BASE_URL),
    GOOGLE_API_KEY: optionalNonEmptyStringSchema,
    MINA_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    MINA_MEDIA_UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(DEFAULT_MEDIA_UPLOAD_MAX_BYTES),
    MINA_PROVIDER_MEDIA_URL_EXPIRES_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(DEFAULT_PROVIDER_MEDIA_URL_EXPIRES_SECONDS),
    MINA_S3_ACCESS_KEY_ID: optionalNonEmptyStringSchema,
    MINA_S3_BUCKET: optionalNonEmptyStringSchema,
    MINA_S3_ENDPOINT: z.url().optional(),
    MINA_S3_FORCE_PATH_STYLE: booleanEnvSchema,
    MINA_S3_PUBLIC_BASE_URL: z.url().optional(),
    MINA_S3_REGION: z.string().trim().min(1).default(DEFAULT_S3_REGION),
    MINA_S3_SECRET_ACCESS_KEY: optionalNonEmptyStringSchema,
    MINA_SCHEDULER_CRON: z.string().trim().min(1).default(DEFAULT_SCHEDULER_CRON),
    MINA_SCHEDULER_ENABLED: booleanEnvSchema,
    MINA_STORAGE_DRIVER: z.literal('s3').default('s3'),
    MINA_STORAGE_ROOT_PREFIX: z.string().trim().min(1).default(DEFAULT_STORAGE_ROOT_PREFIX),
    MINA_TASK_MAX_RUNNING_SECONDS: z.coerce.number().int().positive().default(DEFAULT_TASK_MAX_RUNNING_SECONDS),
    MINA_TASK_POLL_BATCH_SIZE: z.coerce.number().int().positive().default(DEFAULT_TASK_POLL_BATCH_SIZE),
    MINA_TASK_POLL_DEFAULT_INTERVAL_SECONDS: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(DEFAULT_TASK_POLL_DEFAULT_INTERVAL_SECONDS),
    MINA_TASK_POLL_LEASE_SECONDS: z.coerce.number().int().positive().default(DEFAULT_TASK_POLL_LEASE_SECONDS),
    MINA_TASK_POLL_MAX_INTERVAL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(DEFAULT_TASK_POLL_MAX_INTERVAL_SECONDS),
    MINA_TASK_PROVIDER_ERROR_MAX_RETRIES: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(DEFAULT_TASK_PROVIDER_ERROR_MAX_RETRIES),
    VOLCENGINE_ARK_API_KEY: optionalNonEmptyStringSchema,
    VOLCENGINE_ARK_BASE_URL: z.url().default(DEFAULT_VOLCENGINE_ARK_BASE_URL),
    VOLCENGINE_ARK_MODEL_API_KEYS: optionalNonEmptyStringSchema,
    VOLCENGINE_IMAGE_MODEL_ALIASES: optionalNonEmptyStringSchema,
    VOLCENGINE_VIDEO_MODEL_ALIASES: optionalNonEmptyStringSchema,
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})

export const apiEnv = {
  allowedOrigin: env.MINA_ALLOWED_ORIGIN,
  databaseUrl: env.MINA_DATABASE_URL,
  googleApiBaseUrl: env.GOOGLE_API_BASE_URL,
  googleApiKey: env.GOOGLE_API_KEY,
  logLevel: env.MINA_LOG_LEVEL,
  mediaUploadMaxBytes: env.MINA_MEDIA_UPLOAD_MAX_BYTES,
  providerMediaUrlExpiresSeconds: env.MINA_PROVIDER_MEDIA_URL_EXPIRES_SECONDS,
  s3AccessKeyId: env.MINA_S3_ACCESS_KEY_ID,
  s3Bucket: env.MINA_S3_BUCKET,
  s3Endpoint: env.MINA_S3_ENDPOINT,
  s3ForcePathStyle: env.MINA_S3_FORCE_PATH_STYLE,
  s3PublicBaseUrl: env.MINA_S3_PUBLIC_BASE_URL,
  s3Region: env.MINA_S3_REGION,
  s3SecretAccessKey: env.MINA_S3_SECRET_ACCESS_KEY,
  schedulerCron: env.MINA_SCHEDULER_CRON,
  schedulerEnabled: env.MINA_SCHEDULER_ENABLED,
  storageDriver: env.MINA_STORAGE_DRIVER,
  storageRootPrefix: env.MINA_STORAGE_ROOT_PREFIX,
  taskMaxRunningSeconds: env.MINA_TASK_MAX_RUNNING_SECONDS,
  taskPollBatchSize: env.MINA_TASK_POLL_BATCH_SIZE,
  taskPollDefaultIntervalSeconds: env.MINA_TASK_POLL_DEFAULT_INTERVAL_SECONDS,
  taskPollLeaseSeconds: env.MINA_TASK_POLL_LEASE_SECONDS,
  taskPollMaxIntervalSeconds: env.MINA_TASK_POLL_MAX_INTERVAL_SECONDS,
  taskProviderErrorMaxRetries: env.MINA_TASK_PROVIDER_ERROR_MAX_RETRIES,
  volcengineArkApiKey: env.VOLCENGINE_ARK_API_KEY,
  volcengineArkBaseUrl: env.VOLCENGINE_ARK_BASE_URL,
  volcengineArkModelApiKeys: env.VOLCENGINE_ARK_MODEL_API_KEYS,
  volcengineImageModelAliases: env.VOLCENGINE_IMAGE_MODEL_ALIASES,
  volcengineVideoModelAliases: env.VOLCENGINE_VIDEO_MODEL_ALIASES,
  nodeEnv: env.NODE_ENV,
  port: env.MINA_API_PORT,
} as const
