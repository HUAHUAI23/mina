import { generateText, streamText, type ModelMessage, type UserModelMessage } from 'ai'
import type {
  ChatMessage,
  ChatMessagePart,
  ChatMessageStatus,
} from '@mina/contracts/modules/chat'

import type { MediaObjectService } from '../media/media-object.service'
import { ObjectStorageReadLimitError } from '../../lib/storage/object-storage'
import type { AiChatModelFactory } from './ai-chat-provider'
import { ClassifiedChatAssistantError, classifyChatAssistantError, toClassification } from './chat-error-classifier'

export interface AiChatServiceConfig {
  systemPrompt: string
  timeoutMs: number
}

export interface GenerateAssistantMessageInput {
  accountId: string
  history: ChatMessage[]
}

export interface GenerateAssistantMessageResult {
  parts: ChatMessagePart[]
  status: ChatMessageStatus
}

export interface StreamAssistantMessageDelta {
  delta: string
  text: string
}

export interface AssistantChatResponder {
  generateAssistantMessage(input: GenerateAssistantMessageInput): Promise<GenerateAssistantMessageResult>
  isEnabled(): boolean
  streamAssistantMessage(
    input: GenerateAssistantMessageInput,
    onDelta: (delta: StreamAssistantMessageDelta) => void | Promise<void>,
  ): Promise<GenerateAssistantMessageResult>
}

const MAX_FILE_PART_BYTES = 8 * 1024 * 1024
const MAX_ASSISTANT_TEXT_CHARS = 20_000
const MAX_TEXT_FILE_CHARS = 40_000

export class AiChatService implements AssistantChatResponder {
  constructor(
    private readonly modelFactory: AiChatModelFactory,
    private readonly mediaObjectService: MediaObjectService,
    private readonly config: AiChatServiceConfig,
  ) {}

  isEnabled(): boolean {
    return this.modelFactory.isConfigured()
  }

  async generateAssistantMessage(input: GenerateAssistantMessageInput): Promise<GenerateAssistantMessageResult> {
    const model = this.modelFactory.createModel()
    if (!model) {
      throw new ClassifiedChatAssistantError(toClassification(
        'AI_NOT_CONFIGURED',
        'AI is not configured for this Mina instance.',
      ))
    }
    try {
      const messages = await this.toModelMessages(input.accountId, input.history)
      const result = await generateText({
        model,
        messages,
        system: this.config.systemPrompt,
        timeout: this.config.timeoutMs,
      })
      const text = result.text.trim()
      return {
        parts: [{
          type: 'text',
          text: this.assistantText(text || 'The assistant returned an empty response.'),
        }],
        status: 'sent',
      }
    } catch (error) {
      throw new ClassifiedChatAssistantError(classifyChatAssistantError(error))
    }
  }

  async streamAssistantMessage(
    input: GenerateAssistantMessageInput,
    onDelta: (delta: StreamAssistantMessageDelta) => void | Promise<void>,
  ): Promise<GenerateAssistantMessageResult> {
    const model = this.modelFactory.createModel()
    if (!model) {
      throw new ClassifiedChatAssistantError(toClassification(
        'AI_NOT_CONFIGURED',
        'AI is not configured for this Mina instance.',
      ))
    }
    let text = ''
    try {
      const messages = await this.toModelMessages(input.accountId, input.history)
      const result = streamText({
        model,
        messages,
        system: this.config.systemPrompt,
        timeout: this.config.timeoutMs,
      })
      for await (const delta of result.textStream) {
        if (!delta) {
          continue
        }
        text += delta
        await onDelta({ delta, text })
      }
      const trimmed = text.trim()
      return {
        parts: [{
          type: 'text',
          text: this.assistantText(trimmed || 'The assistant returned an empty response.'),
        }],
        status: 'sent',
      }
    } catch (error) {
      throw new ClassifiedChatAssistantError(classifyChatAssistantError(error))
    }
  }

  private async toModelMessages(accountId: string, history: ChatMessage[]): Promise<ModelMessage[]> {
    const messages: ModelMessage[] = []
    for (const message of history) {
      if (message.role === 'system') {
        continue
      }
      if (message.role === 'assistant') {
        const text = message.parts
          .flatMap((part) => part.type === 'text' ? [part.text] : part.type === 'error' ? [part.message] : [])
          .join('\n')
          .trim()
        if (text) {
          messages.push({ role: 'assistant', content: text })
        }
        continue
      }
      const content = await this.toUserContent(accountId, message.parts)
      if (typeof content === 'string' ? content.trim() : content.length > 0) {
        messages.push({ role: 'user', content })
      }
    }
    return messages
  }

  private async toUserContent(
    accountId: string,
    parts: ChatMessagePart[],
  ): Promise<UserModelMessage['content']> {
    const content: Exclude<UserModelMessage['content'], string> = []
    for (const part of parts) {
      if (part.type === 'text') {
        content.push({ type: 'text', text: part.text })
        continue
      }
      if (part.type === 'image') {
        content.push(await this.toImageContent(accountId, part))
        continue
      }
      if (part.type === 'file') {
        const fileContent = await this.toSupportedFileContent(accountId, part)
        if (fileContent) {
          content.push(fileContent)
          continue
        }
        content.push({
          type: 'text',
          text: `[Attached file: ${part.name}${part.mimeType ? `, ${part.mimeType}` : ''}${part.byteSize === undefined ? '' : `, ${part.byteSize} bytes`}]`,
        })
      }
    }
    return content.length === 1 && content[0]?.type === 'text' ? content[0].text : content
  }

  private async toImageContent(
    accountId: string,
    part: Extract<ChatMessagePart, { type: 'image' }>,
  ): Promise<Exclude<UserModelMessage['content'], string>[number]> {
    if (part.byteSize !== undefined && part.byteSize > MAX_FILE_PART_BYTES) {
      return { type: 'text', text: this.attachmentMetadataText(part) }
    }
    try {
      const body = await this.mediaObjectService.readBody(accountId, part.mediaObjectId, MAX_FILE_PART_BYTES)
      return {
        type: 'file',
        data: body,
        mediaType: part.mimeType ?? 'image/*',
      }
    } catch (error) {
      if (error instanceof ObjectStorageReadLimitError) {
        return { type: 'text', text: this.attachmentMetadataText(part) }
      }
      throw error
    }
  }

  private async toSupportedFileContent(
    accountId: string,
    part: Extract<ChatMessagePart, { type: 'file' }>,
  ): Promise<Exclude<UserModelMessage['content'], string>[number] | undefined> {
    const mediaType = part.mimeType ?? 'application/octet-stream'
    if (part.byteSize !== undefined && part.byteSize > MAX_FILE_PART_BYTES) {
      return undefined
    }
    if (mediaType.startsWith('text/') || mediaType === 'application/json') {
      const body = await this.readAttachmentBody(accountId, part.mediaObjectId)
      if (!body) {
        return undefined
      }
      const text = new TextDecoder().decode(body).slice(0, MAX_TEXT_FILE_CHARS)
      return {
        type: 'text',
        text: `[Attached file: ${part.name}]\n${text}`,
      }
    }
    if (mediaType === 'application/pdf' || mediaType.startsWith('audio/')) {
      const body = await this.readAttachmentBody(accountId, part.mediaObjectId)
      if (!body) {
        return undefined
      }
      return {
        type: 'file',
        data: body,
        filename: part.name,
        mediaType,
      }
    }
    return undefined
  }

  private async readAttachmentBody(accountId: string, mediaObjectId: string): Promise<Uint8Array | undefined> {
    try {
      return await this.mediaObjectService.readBody(accountId, mediaObjectId, MAX_FILE_PART_BYTES)
    } catch (error) {
      if (error instanceof ObjectStorageReadLimitError) {
        return undefined
      }
      throw error
    }
  }

  private attachmentMetadataText(part: Extract<ChatMessagePart, { type: 'file' | 'image' }>): string {
    const label = part.type === 'file' ? `Attached file: ${part.name}` : `Attached image: ${part.mediaObjectId}`
    const details = [
      label,
      part.mimeType,
      part.byteSize === undefined ? undefined : `${part.byteSize} bytes`,
    ].filter((value): value is string => Boolean(value))
    return `[${details.join(', ')}]`
  }

  private assistantText(text: string): string {
    return text.trim().slice(0, MAX_ASSISTANT_TEXT_CHARS)
  }
}
