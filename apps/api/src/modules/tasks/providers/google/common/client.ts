import { apiEnv } from '../../../../../config/env'
import { createGoogleProviderError } from './errors'

export interface GoogleClientConfig {
  apiBaseUrl?: string
  apiKey?: string
}

export interface GeminiApiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: {
          data: string
          mimeType: string
        }
        text?: string
        thought?: boolean
        thoughtSignature?: string
      }>
    }
    finishReason?: string
    groundingMetadata?: Record<string, unknown>
  }>
  error?: {
    code: number
    message: string
    status: string
  }
  usageMetadata?: {
    candidatesTokenCount?: number
    promptTokenCount?: number
    totalTokenCount?: number
  }
}

export interface GoogleVideoOperation {
  done?: boolean
  error?: {
    code?: number
    message?: string
    status?: string
  }
  name: string
  response?: {
    generateVideoResponse?: {
      generatedSamples?: Array<{
        video?: {
          mimeType?: string
          uri?: string
        }
      }>
    }
  }
}

export class GoogleProviderClient {
  private readonly apiBaseUrl: string
  private readonly apiKey: string | undefined

  constructor(config: GoogleClientConfig = {}) {
    this.apiBaseUrl = (config.apiBaseUrl ?? apiEnv.googleApiBaseUrl).replace(/\/+$/, '')
    this.apiKey = config.apiKey ?? apiEnv.googleApiKey
  }

  async generateImage(model: string, payload: Record<string, unknown>): Promise<GeminiApiResponse> {
    return this.request<GeminiApiResponse>(`/v1beta/models/${model}:generateContent`, {
      body: JSON.stringify(payload),
      method: 'POST',
    })
  }

  async createVideo(model: string, payload: Record<string, unknown>): Promise<GoogleVideoOperation> {
    return this.request<GoogleVideoOperation>(`/v1beta/models/${model}:predictLongRunning`, {
      body: JSON.stringify(payload),
      method: 'POST',
    })
  }

  async getVideoOperation(operationName: string): Promise<GoogleVideoOperation> {
    return this.request<GoogleVideoOperation>(`/v1beta/${operationName.replace(/^\//, '')}`, {
      method: 'GET',
    })
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    if (!this.apiKey) {
      throw createGoogleProviderError('GOOGLE_API_KEY is not configured.', { code: -1, statusCode: 0 })
    }

    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
        ...(init.headers ?? {}),
      },
    })

    const payload = (await response.json()) as T & { error?: { code?: number; message?: string } }
    if (!response.ok || payload.error) {
      throw createGoogleProviderError(payload.error?.message ?? `Google API request failed: ${response.status}`, {
        ...(payload.error?.code !== undefined ? { code: payload.error.code } : {}),
        statusCode: response.status,
      })
    }
    return payload
  }
}
