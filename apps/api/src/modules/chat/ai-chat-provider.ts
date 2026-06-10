import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'

export interface AiChatProviderConfig {
  apiKey: string | undefined
  baseUrl: string | undefined
  model: string | undefined
  providerName: string
}

export interface AiChatModelFactory {
  isConfigured(): boolean
  createModel(): LanguageModel | undefined
}

export class OpenAiCompatibleChatModelFactory implements AiChatModelFactory {
  constructor(private readonly config: AiChatProviderConfig) {}

  isConfigured(): boolean {
    return Boolean(this.config.apiKey && this.config.baseUrl && this.config.model)
  }

  createModel(): LanguageModel | undefined {
    const { apiKey, baseUrl, model } = this.config
    if (!apiKey || !baseUrl || !model) {
      return undefined
    }
    const provider = createOpenAICompatible({
      apiKey,
      baseURL: baseUrl,
      includeUsage: true,
      name: this.config.providerName,
    })
    return provider(model)
  }
}
