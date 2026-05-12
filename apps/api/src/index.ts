import { createApp } from './app/create-app'
import { apiEnv } from './config/env'

const app = createApp()

if (apiEnv.nodeEnv !== 'test') {
  console.log(`API server running at http://localhost:${apiEnv.port}`)
}

export { app }
export type { AppType } from './app/api-router'

export default {
  port: apiEnv.port,
  fetch: app.fetch,
}
