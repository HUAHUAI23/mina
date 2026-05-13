import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

const DEFAULT_ALLOWED_ORIGIN = 'http://localhost:3000'
const DEFAULT_API_PORT = 3001
export const DEFAULT_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/mina'
const DEFAULT_SCHEDULER_CRON = '*/5 * * * * *'
const DEFAULT_S3_REGION = 'us-east-1'
const DEFAULT_STORAGE_ROOT_PREFIX = 'users'
const DEFAULT_TASK_MAX_RUNNING_SECONDS = 21_600
const DEFAULT_TASK_POLL_BATCH_SIZE = 25
const DEFAULT_TASK_POLL_DEFAULT_INTERVAL_SECONDS = 10
const DEFAULT_TASK_POLL_LEASE_SECONDS = 30
const DEFAULT_TASK_POLL_MAX_INTERVAL_SECONDS = 120
const DEFAULT_TASK_PROVIDER_ERROR_MAX_RETRIES = 8

const booleanEnvSchema = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true')

const optionalNonEmptyStringSchema = z.string().trim().min(1).optional()

const env = createEnv({
  server: {
    MINA_ALLOWED_ORIGIN: z.string().trim().min(1).default(DEFAULT_ALLOWED_ORIGIN),
    MINA_API_PORT: z.coerce.number().int().positive().default(DEFAULT_API_PORT),
    MINA_DATABASE_URL: z.url().optional(),
    MINA_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    MINA_PERSISTENCE_DRIVER: z.enum(['memory', 'postgres']).default('memory'),
    MINA_S3_ACCESS_KEY_ID: optionalNonEmptyStringSchema,
    MINA_S3_BUCKET: optionalNonEmptyStringSchema,
    MINA_S3_ENDPOINT: z.url().optional(),
    MINA_S3_FORCE_PATH_STYLE: booleanEnvSchema,
    MINA_S3_PUBLIC_BASE_URL: z.url().optional(),
    MINA_S3_REGION: z.string().trim().min(1).default(DEFAULT_S3_REGION),
    MINA_S3_SECRET_ACCESS_KEY: optionalNonEmptyStringSchema,
    MINA_SCHEDULER_CRON: z.string().trim().min(1).default(DEFAULT_SCHEDULER_CRON),
    MINA_SCHEDULER_ENABLED: booleanEnvSchema,
    MINA_STORAGE_DRIVER: z.enum(['memory', 's3']).default('memory'),
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
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})

export const apiEnv = {
  allowedOrigin: env.MINA_ALLOWED_ORIGIN,
  databaseUrl: env.MINA_DATABASE_URL,
  logLevel: env.MINA_LOG_LEVEL,
  persistenceDriver: env.MINA_PERSISTENCE_DRIVER,
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
  nodeEnv: env.NODE_ENV,
  port: env.MINA_API_PORT,
} as const
