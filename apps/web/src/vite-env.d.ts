/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_WORKFLOW_CANVAS_SYNC_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
