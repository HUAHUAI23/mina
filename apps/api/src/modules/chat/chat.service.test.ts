import { describe, expect, test } from 'bun:test'
import type { ChatEvent, ChatMessagePart } from '@mina/contracts/modules/chat'
import type { LanguageModel } from 'ai'

import { AiChatService } from './ai-chat.service'
import type {
  AssistantChatResponder,
  GenerateAssistantMessageInput,
  GenerateAssistantMessageResult,
  StreamAssistantMessageDelta,
} from './ai-chat.service'
import type { AiChatModelFactory } from './ai-chat-provider'
import { OpenAiCompatibleChatModelFactory } from './ai-chat-provider'
import { ClassifiedChatAssistantError } from './chat-error-classifier'
import { InMemoryChatEventBus } from './chat-event-bus'
import { ChatService } from './chat.service'
import { MediaObjectService } from '../media/media-object.service'
import {
  FakeChatRepository,
  FakeMediaObjectRepository,
  FakeObjectStorage,
  FakePricingRepository,
  FakeTaskRepository,
  FakeTaskEventLog,
  FakeWorkflowDefinitionRepository,
  FakeWorkflowNodeTaskRepository,
  FakeWorkflowRunEventLog,
  FakeWorkflowRunRepository,
  FakeWorkflowYjsRepository,
} from '../../test/doubles'
import { WorkflowsService } from '../workflows/workflows.service'
import { TasksService } from '../tasks/tasks.service'
import { PricingService } from '../pricing/pricing.service'
import { MediaResolvingTaskProvider } from '../tasks/providers/media-resolving-task-provider'
import { ProviderRouter } from '../tasks/models/provider-router'
import { registerTaskModels } from '../tasks/models/register-models'
import { ModelRegistry } from '../tasks/models/model-registry'
import { ProviderMediaUrlResolver } from '../tasks/providers/provider-media-url-resolver'
import { TaskOutputFinalizer } from '../tasks/output/task-output-finalizer'
import { OutputPostProcessor } from '../tasks/output/output-post-processor'
import { DeterministicVideoFrameGenerator } from '../tasks/output/video-frame-generator'
import { TaskConfigAssembler } from '../tasks/config/task-config-assembler'
import { WorkflowMediaResolver } from '../workflows/media/workflow-media-resolver'
import { WorkflowYjsRoomService } from '../workflows/collaboration/workflow-yjs-room.service'
import { BusWorkflowRunEventPublisher } from '../workflows/workflow-run-event-publisher'
import { InMemoryWorkflowEventBus } from '../workflows/workflow-event-bus'

class FakeAssistantResponder implements AssistantChatResponder {
  calls: GenerateAssistantMessageInput[] = []
  deltas = ['Assistant ', 'reply ', 'from fake AI.']

  isEnabled(): boolean {
    return true
  }

  async generateAssistantMessage(input: GenerateAssistantMessageInput): Promise<GenerateAssistantMessageResult> {
    this.calls.push(input)
    return {
      parts: [{ type: 'text', text: 'Assistant reply from fake AI.' } satisfies ChatMessagePart],
      status: 'sent',
    }
  }

  async streamAssistantMessage(
    input: GenerateAssistantMessageInput,
    onDelta: (delta: StreamAssistantMessageDelta) => void | Promise<void>,
  ): Promise<GenerateAssistantMessageResult> {
    this.calls.push(input)
    let text = ''
    for (const delta of this.deltas) {
      text += delta
      await onDelta({ delta, text })
    }
    return {
      parts: [{ type: 'text', text: text.trim() } satisfies ChatMessagePart],
      status: 'sent',
    }
  }
}

class DeferredAssistantResponder implements AssistantChatResponder {
  calls: GenerateAssistantMessageInput[] = []
  readonly #resolvers: Array<() => void> = []

  get pendingCount(): number {
    return this.#resolvers.length
  }

  isEnabled(): boolean {
    return true
  }

  async generateAssistantMessage(input: GenerateAssistantMessageInput): Promise<GenerateAssistantMessageResult> {
    return this.streamAssistantMessage(input, () => undefined)
  }

  async streamAssistantMessage(
    input: GenerateAssistantMessageInput,
    onDelta: (delta: StreamAssistantMessageDelta) => void | Promise<void>,
  ): Promise<GenerateAssistantMessageResult> {
    this.calls.push(input)
    const responseIndex = this.calls.length
    await new Promise<void>((resolve) => {
      this.#resolvers.push(resolve)
    })
    const text = `Assistant reply ${responseIndex}.`
    await onDelta({ delta: text, text })
    return {
      parts: [{ type: 'text', text } satisfies ChatMessagePart],
      status: 'sent',
    }
  }

  releaseNext(): void {
    const resolve = this.#resolvers.shift()
    if (!resolve) {
      throw new Error('No pending assistant response to release.')
    }
    resolve()
  }
}

class ThrowingAssistantResponder implements AssistantChatResponder {
  calls: GenerateAssistantMessageInput[] = []

  isEnabled(): boolean {
    return true
  }

  async generateAssistantMessage(input: GenerateAssistantMessageInput): Promise<GenerateAssistantMessageResult> {
    return this.streamAssistantMessage(input, () => undefined)
  }

  async streamAssistantMessage(
    input: GenerateAssistantMessageInput,
    _onDelta: (delta: StreamAssistantMessageDelta) => void | Promise<void>,
  ): Promise<GenerateAssistantMessageResult> {
    this.calls.push(input)
    throw new Error('Unexpected assistant transport failure.')
  }
}

class FlakyAssistantResponder implements AssistantChatResponder {
  calls: GenerateAssistantMessageInput[] = []
  failuresRemaining: number

  constructor(failures: number) {
    this.failuresRemaining = failures
  }

  isEnabled(): boolean {
    return true
  }

  async generateAssistantMessage(input: GenerateAssistantMessageInput): Promise<GenerateAssistantMessageResult> {
    return this.streamAssistantMessage(input, () => undefined)
  }

  async streamAssistantMessage(
    input: GenerateAssistantMessageInput,
    onDelta: (delta: StreamAssistantMessageDelta) => void | Promise<void>,
  ): Promise<GenerateAssistantMessageResult> {
    this.calls.push(input)
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1
      throw new Error('fetch failed')
    }
    const text = `Recovered assistant response ${this.calls.length}.`
    await onDelta({ delta: text, text })
    return {
      parts: [{ type: 'text', text } satisfies ChatMessagePart],
      status: 'sent',
    }
  }
}

class ThrowingModelFactory implements AiChatModelFactory {
  isConfigured(): boolean {
    return true
  }

  createModel(): LanguageModel {
    return {
      doGenerate: async () => {
        throw new Error('SECRET_PROVIDER_FAILURE')
      },
      doStream: async () => {
        throw new Error('SECRET_STREAM_FAILURE')
      },
      modelId: 'throwing-model',
      provider: 'test-provider',
      specificationVersion: 'v3',
      supportedUrls: {},
    }
  }
}

class UnconfiguredModelFactory implements AiChatModelFactory {
  isConfigured(): boolean {
    return false
  }

  createModel(): LanguageModel | undefined {
    return undefined
  }
}

const createWorkflowService = (mediaObjectService: MediaObjectService): WorkflowsService => {
  const modelRegistry = registerTaskModels(new ModelRegistry())
  const taskRepository = new FakeTaskRepository()
  const tasksService = new TasksService(
    taskRepository,
    new PricingService(new FakePricingRepository()),
    new MediaResolvingTaskProvider(
      new ProviderRouter(modelRegistry),
      new ProviderMediaUrlResolver(mediaObjectService, 14_400),
    ),
    modelRegistry,
    new TaskOutputFinalizer(mediaObjectService),
    new OutputPostProcessor(new DeterministicVideoFrameGenerator(mediaObjectService)),
    new FakeTaskEventLog(),
  )
  const runs = new FakeWorkflowRunRepository()
  const nodeTasks = new FakeWorkflowNodeTaskRepository(runs, taskRepository)
  const workflowEventBus = new InMemoryWorkflowEventBus()
  const workflowDefinitions = new FakeWorkflowDefinitionRepository()
  const workflowYjsRoomService = new WorkflowYjsRoomService(
    new FakeWorkflowYjsRepository(),
    undefined,
    {
      onSnapshotSaved: async ({ timestamp, version, workflowId }) => {
        await workflowDefinitions.touch(workflowId, timestamp, version)
      },
    },
  )
  return new WorkflowsService(
    {
      definitions: workflowDefinitions,
      nodeStates: runs,
      nodeTasks,
      runs,
    },
    tasksService,
    new TaskConfigAssembler(modelRegistry),
    new WorkflowMediaResolver(mediaObjectService, tasksService),
    workflowYjsRoomService,
    new FakeWorkflowRunEventLog(),
    new BusWorkflowRunEventPublisher(workflowEventBus),
    workflowEventBus,
  )
}

const waitFor = async (predicate: () => boolean | Promise<boolean>): Promise<void> => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await predicate()) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('Condition was not met.')
}

describe('ChatService assistant responses', () => {
  test('stores an assistant message after creating a user message', async () => {
    const repository = new FakeChatRepository()
    const mediaObjectService = new MediaObjectService(
      new FakeMediaObjectRepository(),
      new FakeObjectStorage(),
      {
        fetch: async () => {
          throw new Error('fetcher not configured')
        },
      },
    )
    const eventBus = new InMemoryChatEventBus()
    const events: ChatEvent[] = []
    const assistant = new FakeAssistantResponder()
    const service = new ChatService(
      repository,
      mediaObjectService,
      createWorkflowService(mediaObjectService),
      eventBus,
      assistant,
    )
    const thread = await service.createThread('account_1', { title: 'AI chat' })
    const unsubscribeThread = eventBus.subscribe(thread.id, (event) => {
      events.push(event)
    })

    try {
      await service.createMessage('account_1', thread.id, {
        assistantResponse: true,
        parts: [{ type: 'text', text: 'Hello Mina.' }],
      })

      await waitFor(() => assistant.calls.length === 1)
      await waitFor(async () => {
        const messages = await service.listMessages('account_1', thread.id, { limit: 10 })
        return messages.items.length === 2 && messages.items[1]?.status === 'sent'
      })
      const messages = await service.listMessages('account_1', thread.id, { limit: 10 })
      expect(messages.items.map((message) => message.role)).toEqual(['user', 'assistant'])
      expect(messages.items[1]?.parts).toEqual([{ type: 'text', text: 'Assistant reply from fake AI.' }])

      const assistantCreated = events.find(
        (event) => event.type === 'chat.message.created' && event.message.role === 'assistant',
      )
      expect(assistantCreated).toMatchObject({
        type: 'chat.message.created',
        message: {
          parts: [{ type: 'text', text: '' }],
          role: 'assistant',
          status: 'streaming',
        },
      })
      const deltas = events.filter((event) => event.type === 'chat.message.delta')
      expect(deltas.length).toBeGreaterThan(0)
      expect(deltas.map((event) => event.delta).join('')).toBe('Assistant reply from fake AI.')
      expect(deltas.map((event) => event.sequence)).toEqual(deltas.map((_event, index) => index + 1))
      expect(deltas.at(-1)).toMatchObject({
        status: 'streaming',
        text: 'Assistant reply from fake AI.',
      })
      const assistantUpdated = events.find((event) => event.type === 'chat.message.updated')
      expect(assistantUpdated).toMatchObject({
        type: 'chat.message.updated',
        message: {
          parts: [{ type: 'text', text: 'Assistant reply from fake AI.' }],
          role: 'assistant',
          status: 'sent',
        },
      })
    } finally {
      unsubscribeThread()
    }
  })

  test('serializes queued assistant runs and keeps turn context ordered', async () => {
    const repository = new FakeChatRepository()
    const mediaObjectService = new MediaObjectService(
      new FakeMediaObjectRepository(),
      new FakeObjectStorage(),
      {
        fetch: async () => {
          throw new Error('fetcher not configured')
        },
      },
    )
    const eventBus = new InMemoryChatEventBus()
    const assistant = new DeferredAssistantResponder()
    const service = new ChatService(
      repository,
      mediaObjectService,
      createWorkflowService(mediaObjectService),
      eventBus,
      assistant,
    )
    const thread = await service.createThread('account_1', { title: 'Queued chat' })

    await service.createMessage('account_1', thread.id, {
      parts: [{ type: 'text', text: 'First turn.' }],
    })
    await waitFor(() => assistant.calls.length === 1 && assistant.pendingCount === 1)

    await service.createMessage('account_1', thread.id, {
      parts: [{ type: 'text', text: 'Second turn.' }],
    })
    expect(assistant.calls).toHaveLength(1)
    let messages = await service.listMessages('account_1', thread.id, { limit: 10 })
    expect(messages.items.map((message) => [message.role, message.status])).toEqual([
      ['user', 'sent'],
      ['assistant', 'streaming'],
      ['user', 'sent'],
      ['assistant', 'streaming'],
    ])

    assistant.releaseNext()
    await waitFor(() => assistant.calls.length === 2 && assistant.pendingCount === 1)
    expect(assistant.calls[1]?.history.map((message) => ({
      parts: message.parts,
      role: message.role,
      status: message.status,
    }))).toEqual([
      { parts: [{ type: 'text', text: 'First turn.' }], role: 'user', status: 'sent' },
      { parts: [{ type: 'text', text: 'Assistant reply 1.' }], role: 'assistant', status: 'sent' },
      { parts: [{ type: 'text', text: 'Second turn.' }], role: 'user', status: 'sent' },
    ])

    assistant.releaseNext()
    await waitFor(async () => {
      messages = await service.listMessages('account_1', thread.id, { limit: 10 })
      return messages.items.length === 4 && messages.items.every((message) => message.status === 'sent')
    })
    expect(messages.items.map((message) => message.parts)).toEqual([
      [{ type: 'text', text: 'First turn.' }],
      [{ type: 'text', text: 'Assistant reply 1.' }],
      [{ type: 'text', text: 'Second turn.' }],
      [{ type: 'text', text: 'Assistant reply 2.' }],
    ])
  })

  test('retries transient assistant failures and preserves visible retry state', async () => {
    const repository = new FakeChatRepository()
    const mediaObjectService = new MediaObjectService(
      new FakeMediaObjectRepository(),
      new FakeObjectStorage(),
      {
        fetch: async () => {
          throw new Error('fetcher not configured')
        },
      },
    )
    const eventBus = new InMemoryChatEventBus()
    const assistant = new FlakyAssistantResponder(1)
    const service = new ChatService(
      repository,
      mediaObjectService,
      createWorkflowService(mediaObjectService),
      eventBus,
      assistant,
      {
        assistantRetryBaseMs: 25,
        assistantRetryMaxMs: 25,
        assistantRunMaxAttempts: 3,
      },
    )
    const thread = await service.createThread('account_1', { title: 'Retry chat' })

    await service.createMessage('account_1', thread.id, {
      parts: [{ type: 'text', text: 'Retry transient failure.' }],
    })

    await waitFor(async () => {
      const messages = await service.listMessages('account_1', thread.id, { limit: 10 })
      return messages.items[1]?.status === 'retrying'
    })
    let messages = await service.listMessages('account_1', thread.id, { limit: 10 })
    expect(messages.items[1]).toMatchObject({
      parts: [{
        code: 'AI_PROVIDER_NETWORK',
        messageKey: 'chat_error_ai_provider_network',
        retryState: 'retrying',
        retryable: true,
        type: 'error',
      }],
      role: 'assistant',
      status: 'retrying',
    })

    await waitFor(async () => {
      messages = await service.listMessages('account_1', thread.id, { limit: 10 })
      return messages.items[1]?.status === 'sent'
    })
    expect(assistant.calls).toHaveLength(2)
    expect(messages.items[1]?.parts).toEqual([{ type: 'text', text: 'Recovered assistant response 2.' }])
  })

  test('exposes exhausted retryable assistant failures and supports manual retry', async () => {
    const repository = new FakeChatRepository()
    const mediaObjectService = new MediaObjectService(
      new FakeMediaObjectRepository(),
      new FakeObjectStorage(),
      {
        fetch: async () => {
          throw new Error('fetcher not configured')
        },
      },
    )
    const eventBus = new InMemoryChatEventBus()
    const assistant = new FlakyAssistantResponder(1)
    const service = new ChatService(
      repository,
      mediaObjectService,
      createWorkflowService(mediaObjectService),
      eventBus,
      assistant,
      {
        assistantRetryBaseMs: 1,
        assistantRetryMaxMs: 1,
        assistantRunMaxAttempts: 1,
      },
    )
    const thread = await service.createThread('account_1', { title: 'Manual retry chat' })

    await service.createMessage('account_1', thread.id, {
      parts: [{ type: 'text', text: 'Exhaust then retry.' }],
    })
    await waitFor(async () => {
      const messages = await service.listMessages('account_1', thread.id, { limit: 10 })
      return messages.items[1]?.status === 'failed'
    })
    let messages = await service.listMessages('account_1', thread.id, { limit: 10 })
    const failedAssistant = messages.items[1]
    expect(failedAssistant).toMatchObject({
      parts: [{
        code: 'AI_PROVIDER_NETWORK',
        messageKey: 'chat_error_ai_provider_network',
        retryState: 'exhausted',
        retryable: true,
        type: 'error',
      }],
      status: 'failed',
    })

    expect(failedAssistant).toBeDefined()
    await service.retryAssistantMessage('account_1', thread.id, failedAssistant?.id ?? '')
    await waitFor(async () => {
      messages = await service.listMessages('account_1', thread.id, { limit: 10 })
      return messages.items[1]?.status === 'sent'
    })
    expect(assistant.calls).toHaveLength(2)
    expect(messages.items[1]?.parts).toEqual([{ type: 'text', text: 'Recovered assistant response 2.' }])
  })

  test('marks the assistant placeholder failed when non-retryable streaming throws', async () => {
    const repository = new FakeChatRepository()
    const mediaObjectService = new MediaObjectService(
      new FakeMediaObjectRepository(),
      new FakeObjectStorage(),
      {
        fetch: async () => {
          throw new Error('fetcher not configured')
        },
      },
    )
    const eventBus = new InMemoryChatEventBus()
    const events: ChatEvent[] = []
    const assistant = new ThrowingAssistantResponder()
    const service = new ChatService(
      repository,
      mediaObjectService,
      createWorkflowService(mediaObjectService),
      eventBus,
      assistant,
    )
    const thread = await service.createThread('account_1', { title: 'Failure chat' })
    const unsubscribeThread = eventBus.subscribe(thread.id, (event) => {
      events.push(event)
    })

    try {
      await service.createMessage('account_1', thread.id, {
        parts: [{ type: 'text', text: 'Fail this response.' }],
      })
      await waitFor(async () => {
        const messages = await service.listMessages('account_1', thread.id, { limit: 10 })
        return messages.items.length === 2 && messages.items[1]?.status === 'failed'
      })

      const messages = await service.listMessages('account_1', thread.id, { limit: 10 })
      expect(messages.items[1]).toMatchObject({
        parts: [{
          code: 'CHAT_ASSISTANT_RESPONSE_FAILED',
          message: 'The assistant could not complete this response.',
          messageKey: 'chat_error_assistant_response_failed',
          retryState: 'none',
          retryable: false,
          type: 'error',
        }],
        role: 'assistant',
        status: 'failed',
      })
      expect(events.some((event) => event.type === 'chat.error')).toBe(true)
      expect(events.find((event) => event.type === 'chat.message.updated')).toMatchObject({
        message: {
          role: 'assistant',
          status: 'failed',
        },
        type: 'chat.message.updated',
      })
    } finally {
      unsubscribeThread()
    }
  })

  test('shows an assistant error message when AI settings are not configured', async () => {
    const repository = new FakeChatRepository()
    const mediaObjectService = new MediaObjectService(
      new FakeMediaObjectRepository(),
      new FakeObjectStorage(),
      {
        fetch: async () => {
          throw new Error('fetcher not configured')
        },
      },
    )
    const service = new ChatService(
      repository,
      mediaObjectService,
      createWorkflowService(mediaObjectService),
      new InMemoryChatEventBus(),
      new AiChatService(
        new UnconfiguredModelFactory(),
        mediaObjectService,
        {
          systemPrompt: 'You are Mina.',
          timeoutMs: 5_000,
        },
      ),
    )
    const thread = await service.createThread('account_1', { title: 'Unconfigured chat' })

    await service.createMessage('account_1', thread.id, {
      parts: [{ type: 'text', text: 'Show configuration error.' }],
    })
    await waitFor(async () => {
      const messages = await service.listMessages('account_1', thread.id, { limit: 10 })
      return messages.items.length === 2 && messages.items[1]?.status === 'failed'
    })
    const messages = await service.listMessages('account_1', thread.id, { limit: 10 })

    expect(messages.items[1]).toMatchObject({
      parts: [{
        code: 'AI_NOT_CONFIGURED',
        messageKey: 'chat_error_ai_not_configured',
        retryState: 'none',
        retryable: false,
        type: 'error',
      }],
      role: 'assistant',
      status: 'failed',
    })
  })

  test('reconciles queued assistant runs after a service restart', async () => {
    const repository = new FakeChatRepository()
    const mediaObjectService = new MediaObjectService(
      new FakeMediaObjectRepository(),
      new FakeObjectStorage(),
      {
        fetch: async () => {
          throw new Error('fetcher not configured')
        },
      },
    )
    const assistant = new FakeAssistantResponder()
    const service = new ChatService(
      repository,
      mediaObjectService,
      createWorkflowService(mediaObjectService),
      new InMemoryChatEventBus(),
      assistant,
      { assistantRunStaleMs: 0 },
    )
    const timestamp = '2026-01-01T00:00:00.000Z'
    await repository.createThread({
      accountId: 'account_1',
      id: 'thread_recover_queued',
      timestamp,
      title: 'Recover queued',
    })
    await repository.createMessageWithAssistantRun({
      accountId: 'account_1',
      assistantMessageId: 'message_assistant_queued',
      assistantRunId: 'run_queued',
      maxAttempts: 3,
      parts: [{ type: 'text', text: 'Recover this queued run.' }],
      threadId: 'thread_recover_queued',
      timestamp,
      userMessageId: 'message_user_queued',
    })

    await expect(service.reconcileAssistantRuns()).resolves.toBe(1)
    await waitFor(() => assistant.calls.length === 1)
    const messages = await service.listMessages('account_1', 'thread_recover_queued', { limit: 10 })

    expect(messages.items.map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(messages.items[1]?.status).toBe('sent')
  })

  test('only requeues running assistant runs during automatic retry', async () => {
    const repository = new FakeChatRepository()
    const timestamp = '2026-01-01T00:00:00.000Z'
    await repository.createThread({
      accountId: 'account_1',
      id: 'thread_retry_state',
      timestamp,
      title: 'Retry state machine',
    })
    const { assistantRun } = await repository.createMessageWithAssistantRun({
      accountId: 'account_1',
      assistantMessageId: 'message_assistant_retry_state',
      assistantRunId: 'run_retry_state',
      maxAttempts: 3,
      parts: [{ type: 'text', text: 'Create a retryable run.' }],
      threadId: 'thread_retry_state',
      timestamp,
      userMessageId: 'message_user_retry_state',
    })

    const retryInput = {
      errorCode: 'AI_PROVIDER_NETWORK' as const,
      errorDebugMessage: 'fetch failed',
      errorMessageKey: 'chat_error_ai_provider_network',
      id: assistantRun.id,
      nextRetryAt: '2026-01-01T00:00:02.000Z',
      threadId: 'thread_retry_state',
      timestamp: '2026-01-01T00:00:01.000Z',
    }
    await expect(repository.retryAssistantRun(retryInput)).rejects.toThrow('Failed to retry assistant run.')

    const claimed = await repository.claimNextAssistantRun({
      threadId: 'thread_retry_state',
      timestamp: '2026-01-01T00:00:01.000Z',
    })
    expect(claimed).toMatchObject({
      attemptCount: 1,
      status: 'running',
    })

    await expect(repository.retryAssistantRun(retryInput)).resolves.toMatchObject({
      errorCode: 'AI_PROVIDER_NETWORK',
      nextRetryAt: '2026-01-01T00:00:02.000Z',
      status: 'queued',
    })
  })

  test('requeues stale running assistant runs for recovery', async () => {
    const repository = new FakeChatRepository()
    const mediaObjectService = new MediaObjectService(
      new FakeMediaObjectRepository(),
      new FakeObjectStorage(),
      {
        fetch: async () => {
          throw new Error('fetcher not configured')
        },
      },
    )
    const assistant = new FakeAssistantResponder()
    const service = new ChatService(
      repository,
      mediaObjectService,
      createWorkflowService(mediaObjectService),
      new InMemoryChatEventBus(),
      assistant,
      { assistantRunStaleMs: 0 },
    )
    const timestamp = '2026-01-01T00:00:00.000Z'
    await repository.createThread({
      accountId: 'account_1',
      id: 'thread_recover_stale',
      timestamp,
      title: 'Recover stale',
    })
    await repository.createMessageWithAssistantRun({
      accountId: 'account_1',
      assistantMessageId: 'message_assistant_stale',
      assistantRunId: 'run_stale',
      maxAttempts: 3,
      parts: [{ type: 'text', text: 'Recover this stale run.' }],
      threadId: 'thread_recover_stale',
      timestamp,
      userMessageId: 'message_user_stale',
    })
    await repository.claimNextAssistantRun({
      threadId: 'thread_recover_stale',
      timestamp: '2026-01-01T00:00:01.000Z',
    })

    await expect(service.reconcileAssistantRuns()).resolves.toBe(1)
    await waitFor(() => assistant.calls.length === 1)
    const messages = await service.listMessages('account_1', 'thread_recover_stale', { limit: 10 })

    expect(messages.items.map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(messages.items[1]?.status).toBe('sent')
  })

  test('generates text through an OpenAI-compatible endpoint', async () => {
    const requests: unknown[] = []
    const server = Bun.serve({
      fetch: async (request) => {
        requests.push(await request.json())
        return Response.json({
          id: 'chatcmpl_test',
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: 'test-model',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: 'Real provider shape response.',
            },
            finish_reason: 'stop',
          }],
          usage: {
            prompt_tokens: 1,
            completion_tokens: 1,
            total_tokens: 2,
          },
        })
      },
      port: 0,
    })
    try {
      const mediaObjectService = new MediaObjectService(
        new FakeMediaObjectRepository(),
        new FakeObjectStorage(),
        {
          fetch: async () => {
            throw new Error('fetcher not configured')
          },
        },
      )
      const service = new AiChatService(
        new OpenAiCompatibleChatModelFactory({
          apiKey: 'test-key',
          baseUrl: `http://127.0.0.1:${server.port}/v1`,
          model: 'test-model',
          providerName: 'test-provider',
        }),
        mediaObjectService,
        {
          systemPrompt: 'You are Mina.',
          timeoutMs: 5_000,
        },
      )
      const result = await service.generateAssistantMessage({
        accountId: 'account_1',
        history: [{
          accountId: 'account_1',
          createdAt: new Date().toISOString(),
          id: 'message_1',
          orderIndex: 0,
          parts: [{ type: 'text', text: 'Hello.' }],
          role: 'user',
          status: 'sent',
          threadId: 'thread_1',
          updatedAt: new Date().toISOString(),
        }],
      })

      expect(result.parts).toEqual([{ type: 'text', text: 'Real provider shape response.' }])
      expect(requests).toHaveLength(1)
      expect(requests[0]).toMatchObject({
        messages: [
          { content: 'You are Mina.', role: 'system' },
          { content: 'Hello.', role: 'user' },
        ],
        model: 'test-model',
      })
    } finally {
      await server.stop(true)
    }
  })

  test('streams text deltas through an OpenAI-compatible endpoint', async () => {
    const requests: unknown[] = []
    const encoder = new TextEncoder()
    const server = Bun.serve({
      fetch: async (request) => {
        requests.push(await request.json())
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"id":"chatcmpl_stream_test","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{"role":"assistant","content":"Streamed "},"finish_reason":null}]}\n\n'))
            controller.enqueue(encoder.encode('data: {"id":"chatcmpl_stream_test","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{"content":"response."},"finish_reason":null}]}\n\n'))
            controller.enqueue(encoder.encode('data: {"id":"chatcmpl_stream_test","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n'))
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            controller.close()
          },
        })
        return new Response(stream, {
          headers: {
            'content-type': 'text/event-stream',
          },
        })
      },
      port: 0,
    })
    try {
      const mediaObjectService = new MediaObjectService(
        new FakeMediaObjectRepository(),
        new FakeObjectStorage(),
        {
          fetch: async () => {
            throw new Error('fetcher not configured')
          },
        },
      )
      const service = new AiChatService(
        new OpenAiCompatibleChatModelFactory({
          apiKey: 'test-key',
          baseUrl: `http://127.0.0.1:${server.port}/v1`,
          model: 'test-model',
          providerName: 'test-provider',
        }),
        mediaObjectService,
        {
          systemPrompt: 'You are Mina.',
          timeoutMs: 5_000,
        },
      )
      const deltas: string[] = []
      const snapshots: string[] = []

      const result = await service.streamAssistantMessage({
        accountId: 'account_1',
        history: [{
          accountId: 'account_1',
          createdAt: new Date().toISOString(),
          id: 'message_1',
          orderIndex: 0,
          parts: [{ type: 'text', text: 'Hello.' }],
          role: 'user',
          status: 'sent',
          threadId: 'thread_1',
          updatedAt: new Date().toISOString(),
        }],
      }, (chunk) => {
        deltas.push(chunk.delta)
        snapshots.push(chunk.text)
      })

      expect(result).toEqual({
        parts: [{ type: 'text', text: 'Streamed response.' }],
        status: 'sent',
      })
      expect(deltas).toEqual(['Streamed ', 'response.'])
      expect(snapshots).toEqual(['Streamed ', 'Streamed response.'])
      expect(requests[0]).toMatchObject({ stream: true })
    } finally {
      await server.stop(true)
    }
  })

  test('keeps raw provider errors out of user-facing assistant messages', async () => {
    const mediaObjectService = new MediaObjectService(
      new FakeMediaObjectRepository(),
      new FakeObjectStorage(),
      {
        fetch: async () => {
          throw new Error('fetcher not configured')
        },
      },
    )
    const service = new AiChatService(
      new ThrowingModelFactory(),
      mediaObjectService,
      {
        systemPrompt: 'You are Mina.',
        timeoutMs: 5_000,
      },
    )

    try {
      await service.generateAssistantMessage({
        accountId: 'account_1',
        history: [{
          accountId: 'account_1',
          createdAt: new Date().toISOString(),
          id: 'message_1',
          orderIndex: 0,
          parts: [{ type: 'text', text: 'Hello.' }],
          role: 'user',
          status: 'sent',
          threadId: 'thread_1',
          updatedAt: new Date().toISOString(),
        }],
      })
      throw new Error('Expected assistant generation to fail.')
    } catch (error) {
      expect(error).toBeInstanceOf(ClassifiedChatAssistantError)
      expect((error as ClassifiedChatAssistantError).classification).toMatchObject({
        code: 'CHAT_ASSISTANT_RESPONSE_FAILED',
        message: 'The assistant could not complete this response.',
        messageKey: 'chat_error_assistant_response_failed',
        retryable: false,
      })
      expect((error as ClassifiedChatAssistantError).classification.message).not.toContain('SECRET_PROVIDER_FAILURE')
      expect((error as ClassifiedChatAssistantError).classification.debugMessage).toContain('SECRET_PROVIDER_FAILURE')
    }
  })

  test('sends uploaded images and text files to the OpenAI-compatible request body', async () => {
    const requests: unknown[] = []
    const server = Bun.serve({
      fetch: async (request) => {
        requests.push(await request.json())
        return Response.json({
          id: 'chatcmpl_attachment_test',
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: 'test-model',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: 'Saw attachments.',
            },
            finish_reason: 'stop',
          }],
        })
      },
      port: 0,
    })
    try {
      const mediaObjectService = new MediaObjectService(
        new FakeMediaObjectRepository(),
        new FakeObjectStorage(),
        {
          fetch: async () => {
            throw new Error('fetcher not configured')
          },
        },
      )
      const image = await mediaObjectService.createFromBuffer({
        accountId: 'account_1',
        body: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        kind: 'image',
        mimeType: 'image/png',
        origin: 'user_upload',
        purpose: 'chat_attachment',
        retention: 'project_scoped',
      })
      const textFile = await mediaObjectService.createFromBuffer({
        accountId: 'account_1',
        body: new TextEncoder().encode('Important file content.'),
        kind: 'file',
        mimeType: 'text/plain',
        origin: 'user_upload',
        purpose: 'chat_attachment',
        retention: 'project_scoped',
      })
      const service = new AiChatService(
        new OpenAiCompatibleChatModelFactory({
          apiKey: 'test-key',
          baseUrl: `http://127.0.0.1:${server.port}/v1`,
          model: 'test-model',
          providerName: 'test-provider',
        }),
        mediaObjectService,
        {
          systemPrompt: 'You are Mina.',
          timeoutMs: 5_000,
        },
      )

      await service.generateAssistantMessage({
        accountId: 'account_1',
        history: [{
          accountId: 'account_1',
          createdAt: new Date().toISOString(),
          id: 'message_1',
          orderIndex: 0,
          parts: [
            { type: 'text', text: 'Use these attachments.' },
            { type: 'image', mediaObjectId: image.id, mimeType: image.mimeType },
            { type: 'file', mediaObjectId: textFile.id, mimeType: textFile.mimeType, name: 'notes.txt' },
          ],
          role: 'user',
          status: 'sent',
          threadId: 'thread_1',
          updatedAt: new Date().toISOString(),
        }],
      })

      expect(requests).toHaveLength(1)
      expect(requests[0]).toMatchObject({
        messages: [
          { role: 'system' },
          {
            content: [
              { text: 'Use these attachments.', type: 'text' },
              { image_url: { url: expect.stringContaining('data:image/png;base64,') }, type: 'image_url' },
              { text: expect.stringContaining('Important file content.'), type: 'text' },
            ],
            role: 'user',
          },
        ],
      })
    } finally {
      await server.stop(true)
    }
  })

  test('degrades oversized attachments to prompt metadata instead of failing generation', async () => {
    const requests: unknown[] = []
    const server = Bun.serve({
      fetch: async (request) => {
        requests.push(await request.json())
        return Response.json({
          id: 'chatcmpl_oversized_attachment_test',
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: 'test-model',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: 'Saw attachment metadata.',
            },
            finish_reason: 'stop',
          }],
        })
      },
      port: 0,
    })
    try {
      const mediaObjectService = new MediaObjectService(
        new FakeMediaObjectRepository(),
        new FakeObjectStorage(),
        {
          fetch: async () => {
            throw new Error('fetcher not configured')
          },
        },
      )
      const oversizedImage = await mediaObjectService.createFromBuffer({
        accountId: 'account_1',
        body: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        kind: 'image',
        mimeType: 'image/png',
        origin: 'user_upload',
        purpose: 'chat_attachment',
        retention: 'project_scoped',
      })
      const oversizedTextFile = await mediaObjectService.createFromBuffer({
        accountId: 'account_1',
        body: new Uint8Array(8 * 1024 * 1024 + 1),
        kind: 'file',
        mimeType: 'text/plain',
        origin: 'user_upload',
        purpose: 'chat_attachment',
        retention: 'project_scoped',
      })
      const service = new AiChatService(
        new OpenAiCompatibleChatModelFactory({
          apiKey: 'test-key',
          baseUrl: `http://127.0.0.1:${server.port}/v1`,
          model: 'test-model',
          providerName: 'test-provider',
        }),
        mediaObjectService,
        {
          systemPrompt: 'You are Mina.',
          timeoutMs: 5_000,
        },
      )

      const result = await service.generateAssistantMessage({
        accountId: 'account_1',
        history: [{
          accountId: 'account_1',
          createdAt: new Date().toISOString(),
          id: 'message_1',
          orderIndex: 0,
          parts: [
            {
              byteSize: 8 * 1024 * 1024 + 1,
              mediaObjectId: oversizedImage.id,
              mimeType: oversizedImage.mimeType,
              type: 'image',
            },
            {
              mediaObjectId: oversizedTextFile.id,
              mimeType: oversizedTextFile.mimeType,
              name: 'large.txt',
              type: 'file',
            },
          ],
          role: 'user',
          status: 'sent',
          threadId: 'thread_1',
          updatedAt: new Date().toISOString(),
        }],
      })

      expect(result).toMatchObject({
        parts: [{ type: 'text', text: 'Saw attachment metadata.' }],
        status: 'sent',
      })
      expect(requests).toHaveLength(1)
      expect(requests[0]).toMatchObject({
        messages: [
          { role: 'system' },
          {
            content: [
              {
                text: expect.stringContaining('Attached image:'),
                type: 'text',
              },
              {
                text: expect.stringContaining('Attached file: large.txt'),
                type: 'text',
              },
            ],
            role: 'user',
          },
        ],
      })
    } finally {
      await server.stop(true)
    }
  })
})
