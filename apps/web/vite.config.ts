import { createEnv } from '@t3-oss/env-core'
import { defineConfig, loadEnv, searchForWorkspaceRoot } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { z } from 'zod'

export default defineConfig(({ mode }) => {
  const env = createEnv({
    server: {
      MINA_API_PORT: z.coerce.number().int().positive().default(3001),
    },
    runtimeEnv: loadEnv(mode, process.cwd(), ''),
    emptyStringAsUndefined: true,
  })
  const apiPort = String(env.MINA_API_PORT)

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: true,
      fs: {
        allow: [searchForWorkspaceRoot(process.cwd())],
      },
      proxy: {
        '/api': {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
  }
})
