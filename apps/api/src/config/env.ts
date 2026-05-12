const DEFAULT_API_PORT = 3001

const resolvePort = (value: string | undefined): number => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_API_PORT
}

export const apiEnv = {
  allowedOrigin: Bun.env.MINA_ALLOWED_ORIGIN ?? '*',
  databaseUrl: Bun.env.MINA_DATABASE_URL,
  nodeEnv: Bun.env.NODE_ENV ?? 'development',
  port: resolvePort(Bun.env.MINA_API_PORT),
} as const
