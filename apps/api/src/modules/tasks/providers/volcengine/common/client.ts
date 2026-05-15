import { apiEnv } from '../../../../../config/env'
import { createVolcengineProviderError } from './errors'
import { parseJsonStringMap } from './model-aliases'

export interface VolcengineClientConfig {
  apiBaseUrl?: string
  apiKey?: string
  modelApiKeys?: string
}

export interface ArkApiResponse<T = unknown> {
  created?: number
  data?: T
  error?: {
    code?: string
    message?: string
    type?: string
  }
  model?: string
  usage?: {
    completion_tokens?: number
    prompt_tokens?: number
    token_count?: number
    total_tokens?: number
  }
}

export type VolcengineVideoTaskStatus = 'queued' | 'running' | 'cancelled' | 'succeeded' | 'failed' | 'expired'

export interface VolcengineVideoTaskResponse {
  content?: {
    last_frame_url?: string
    video_url?: string
  }
  error?: {
    code: string
    message: string
  }
  id: string
  status: VolcengineVideoTaskStatus
  usage?: {
    completion_tokens?: number
    total_tokens?: number
  }
}

export class VolcengineProviderClient {
  private readonly apiBaseUrl: string
  private readonly apiKey: string | undefined
  private readonly modelApiKeys: Map<string, string>

  constructor(config: VolcengineClientConfig = {}) {
    this.apiBaseUrl = (config.apiBaseUrl ?? apiEnv.volcengineArkBaseUrl).replace(/\/+$/, '')
    this.apiKey = config.apiKey ?? apiEnv.volcengineArkApiKey
    this.modelApiKeys = parseJsonStringMap(config.modelApiKeys ?? apiEnv.volcengineArkModelApiKeys)
  }

  async generateImages<T>(model: string, body: Record<string, unknown>): Promise<ArkApiResponse<T>> {
    return this.request<ArkApiResponse<T>>('/images/generations', {
      body: JSON.stringify(body),
      method: 'POST',
    }, model)
  }

  async createVideoTask(model: string, body: Record<string, unknown>): Promise<{ id: string }> {
    return this.request<{ id: string }>('/contents/generations/tasks', {
      body: JSON.stringify(body),
      method: 'POST',
    }, model)
  }

  async getVideoTask(taskId: string, model: string): Promise<VolcengineVideoTaskResponse> {
    return this.request<VolcengineVideoTaskResponse>(`/contents/generations/tasks/${taskId}`, {
      method: 'GET',
    }, model)
  }

  private apiKeyForModel(model: string): string | undefined {
    return this.modelApiKeys.get(model) ?? this.apiKey
  }

  private async request<T>(path: string, init: RequestInit, model: string): Promise<T> {
    const apiKey = this.apiKeyForModel(model)
    if (!apiKey) {
      throw createVolcengineProviderError(`Volcengine API key is not configured for ${model}.`, {
        code: -1,
        statusCode: 0,
      })
    }

    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    })
    const payload = (await response.json()) as T & { error?: { code?: string; message?: string } }
    if (!response.ok || payload.error) {
      const code = payload.error?.code ? Number(payload.error.code) : undefined
      throw createVolcengineProviderError(payload.error?.message ?? `Volcengine API request failed: ${response.status}`, {
        ...(code !== undefined ? { code } : {}),
        statusCode: response.status,
      })
    }
    return payload
  }
}
