# Task Provider Model Configuration Architecture

## Status

Date: 2026-05-14

This document is the implementation guide for the task provider and model configuration architecture. It defines the target design directly. Do not introduce a parallel versioned task config or a legacy compatibility layer as part of this work.

Implementation status: landed in the API and contracts codebase on 2026-05-14. The implementation keeps this document as the target architecture reference while the concrete code lives under `packages/contracts/src/modules/tasks`, `packages/contracts/src/modules/canvas`, and `apps/api/src/modules/tasks`.

## Goals

1. Make provider and model additions predictable: adding a new model should mostly mean adding a model spec, mapper, provider client tests, and registry entry.
2. Keep workflow execution independent from provider-specific parameters.
3. Keep task lifecycle independent from provider-specific request, polling, pricing, and output mapping details.
4. Store task configuration in a stable canonical shape while allowing each model to own its own parameter schema.
5. Keep the design simple enough to debug under production pressure.
6. Avoid central `if provider === ...` or `if model === ...` branching in workflow execution, task creation, pricing, and lifecycle code.
7. Use runtime validation at every untrusted boundary, with TypeScript types inferred from Zod schemas.
8. Ensure every successful video-generation task has a durable first-frame cover image output for future frontend video cards, previews, and poster displays.

## Non-Goals

1. Do not create a separately versioned task config type. This is a new project and the target type should be named `TaskConfig`.
2. Do not build a generic plugin runtime or dynamic module loader.
3. Do not introduce a dependency injection framework.
4. Do not move provider-specific business rules into `packages/contracts`.
5. Do not make workflow nodes aware of Google, Volcengine, or any future provider-specific parameter names.
6. Do not use a database table per provider or model. The existing JSON task config storage is the right persistence shape for heterogeneous model parameters.

## Reference Basis

The design combines current repository facts with stable external engineering patterns:

1. Ports and Adapters keeps the application core independent from external systems. In this design, tasks and workflows depend on a provider/model port; Google and Volcengine live behind adapters: <https://alistair.cockburn.us/hexagonal-architecture>
2. Gateway Pattern wraps external APIs and translates their request/response shape into application language. Provider clients and mappers are gateways for Google and Volcengine: <https://martinfowler.com/articles/gateway-pattern.html>
3. Dependency Injection and dependency inversion support replacing concrete providers without changing core lifecycle code. This repository should use constructor-injected registries and routers, not a DI framework: <https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection/overview>
4. Zod discriminated unions and object schemas provide runtime validation for polymorphic task config and model parameters: <https://zod.dev/api?id=discriminated-unions>
5. TypeScript discriminated unions and narrowing keep internal code type-safe after runtime validation: <https://www.typescriptlang.org/docs/handbook/2/narrowing.html>
6. Terraform's provider framework is a mature example of provider-owned schemas, validation, and behavior behind a common lifecycle: <https://developer.hashicorp.com/terraform/plugin/framework/validation>

## Current Repository Facts

The current implementation has a good execution baseline:

```text
WorkflowRunExecutor
  -> WorkflowNodeExecutor
    -> task config assembly
      -> TasksService.createTask
        -> TaskLifecycle
          -> TaskProvider
```

The pressure point is the shape and ownership of task configuration:

1. `packages/contracts/src/modules/tasks/task.schemas.ts` currently defines image and video config as global schemas.
2. `apps/api/src/modules/workflows/task-config.ts` currently knows how to assemble image and video task configs from workflow media slots.
3. `apps/api/src/modules/tasks/pricing.ts` currently derives pricing input centrally from global config fields.
4. `apps/api/src/modules/tasks/domain.ts` currently derives provider, model, kind, and mode from global config shape.
5. Real provider implementations in `temp/lumina/lib/server/vendors/google` and `temp/lumina/lib/server/vendors/volcengine` show that different providers and models need different parameter sets, defaults, input constraints, request payloads, execution modes, polling behavior, error mapping, and output normalization.

Examples from the legacy provider code:

1. Google Veo uses parameters such as `aspectRatio`, `resolution`, `durationSeconds`, and `personGeneration`.
2. Google Gemini image generation uses `aspectRatio`, `imageSize`, grounding options, and thinking options.
3. Volcengine Seedream uses `size`, `outputFormat`, sequential image options, prompt optimization, watermark, and tools.
4. Volcengine Seedance uses `ratio`, `resolution`, `duration`, `serviceTier`, `generateAudio`, `returnLastFrame`, and web-search tools.

These fields should not become top-level global `TaskConfig` fields.

## Target Design Summary

Use this architecture:

```text
Workflow execution
  -> Media envelope assembly
  -> TaskConfigAssembler
  -> ModelRegistry
  -> ModelSpec.prepareConfig
  -> TasksService.createTask
  -> ModelSpec pricing/resource/mode methods
  -> TaskLifecycle
  -> ProviderRouter
  -> ModelSpec.start/poll/cancel
  -> Provider gateway/client
```

The central rule:

```text
Stable task envelope globally, model-specific params locally.
```

Workflow code owns only workflow concepts:

1. Incoming edges.
2. Media slots.
3. Required vs optional media policy.
4. Conversion from upstream outputs or assets into `MediaInput`.

Model specs own model concepts:

1. Parameter schema.
2. Defaults.
3. Capabilities.
4. Media compatibility.
5. Pricing input.
6. Task mode.
7. Provider request mapping.
8. Provider response mapping.
9. Provider error translation.

## Canonical Task Config

Replace the current global image/video config shape with this canonical envelope:

```ts
export const TaskConfigSchema = z.object({
  kind: TaskKindSchema,
  provider: z.string().min(1),
  model: z.string().min(1),
  prompt: z.string().min(1),
  media: z
    .object({
      inputImages: z.array(MediaInputSchema).default([]),
      firstFrame: MediaInputSchema.optional(),
      lastFrame: MediaInputSchema.optional(),
      referenceImages: z.array(MediaInputSchema).default([]),
      referenceAudios: z.array(MediaInputSchema).default([]),
      referenceVideos: z.array(MediaInputSchema).default([]),
    })
    .default({}),
  params: z.record(z.string(), z.unknown()).default({}),
})
```

The inferred type remains the public task config type:

```ts
export type TaskConfig = z.infer<typeof TaskConfigSchema>
```

Do not encode provider-specific fields at the top level. The following fields belong in `params`, not beside `kind/provider/model/prompt`:

```text
size
count
resolution
durationSeconds
aspectRatio
ratio
personGeneration
outputFormat
serviceTier
generateAudio
returnLastFrame
webSearch
imageSearch
thinkingLevel
includeThoughts
watermark
sequentialImageGeneration
```

### Why `prepareConfig` Exists

The workflow layer starts from a draft node config and a set of resolved media inputs. That data is not ready to persist or execute because it may be missing defaults, may contain parameters unsupported by the selected model, or may contain invalid media combinations.

`ModelSpec.prepareConfig` is the single model-owned function that turns draft input into a final task config:

```text
draft config + media envelope -> final TaskConfig
```

It must:

1. Validate `params` with the model's Zod schema.
2. Apply model defaults.
3. Enforce model capabilities.
4. Enforce media input limits.
5. Drop or reject unsupported parameters.
6. Return the exact `TaskConfig` that will be stored in `tasks.config`.

It is not a version upgrade step. It is final config preparation.

## Core Types

Create these files:

```text
apps/api/src/modules/tasks/config/task-config.ts
apps/api/src/modules/tasks/config/media-envelope.ts
apps/api/src/modules/tasks/config/task-config-assembler.ts
apps/api/src/modules/tasks/models/model-spec.ts
apps/api/src/modules/tasks/models/model-registry.ts
apps/api/src/modules/tasks/models/provider-router.ts
```

### Media Envelope

`MediaEnvelope` is the workflow-to-task boundary type:

```ts
export interface MediaEnvelope {
  inputImages: MediaInput[]
  firstFrame?: MediaInput
  lastFrame?: MediaInput
  referenceImages: MediaInput[]
  referenceAudios: MediaInput[]
  referenceVideos: MediaInput[]
}
```

Use a builder to avoid scattered object construction:

```ts
export const emptyMediaEnvelope = (): MediaEnvelope => ({
  inputImages: [],
  referenceImages: [],
  referenceAudios: [],
  referenceVideos: [],
})
```

Workflow code should convert resolved media inputs into this envelope and then stop reasoning about provider-specific meaning.

### Task Draft Config

Workflow nodes should store a draft config. The draft has stable fields plus unknown model params:

```ts
export const TaskDraftConfigSchema = z.object({
  kind: TaskKindSchema,
  provider: z.string().min(1),
  model: z.string().min(1),
  prompt: z.string().min(1),
  params: z.record(z.string(), z.unknown()).default({}),
})
```

Use this for workflow node configuration. Use final `TaskConfig` for task records.

### Model Spec

Every executable model must implement this interface:

```ts
export interface ModelSpec<TParams extends Record<string, unknown> = Record<string, unknown>> {
  readonly key: ModelKey
  readonly paramsSchema: z.ZodType<TParams>
  readonly capabilities: ModelCapabilities

  prepareConfig(input: PrepareConfigInput): TaskConfig
  parseConfig(config: TaskConfig): TaskConfig & { params: TParams }
  getTaskMode(config: TaskConfig & { params: TParams }): TaskMode
  getPricingInput(config: TaskConfig & { params: TParams }): PricingEstimateRequest
  collectInputResources(config: TaskConfig & { params: TParams }): MediaInput[]

  start(task: Task & { config: TaskConfig & { params: TParams } }): Promise<ProviderStartResult>
  poll(task: Task & { config: TaskConfig & { params: TParams } }): Promise<ProviderPollResult>
  cancel?(task: Task & { config: TaskConfig & { params: TParams } }): Promise<void>
}
```

Supporting types:

```ts
export interface ModelKey {
  kind: TaskKind
  provider: string
  model: string
}

export interface PrepareConfigInput {
  draft: TaskDraftConfig
  media: MediaEnvelope
}

export interface ModelCapabilities {
  media: {
    inputImages?: MediaLimit
    firstFrame?: boolean
    lastFrame?: boolean
    referenceImages?: MediaLimit
    referenceAudios?: MediaLimit
    referenceVideos?: MediaLimit
  }
  output: {
    images?: boolean
    video?: boolean
    lastFrame?: boolean
  }
}

export interface MediaLimit {
  min?: number
  max: number
}
```

Keep `ModelCapabilities` intentionally small. Do not try to describe every possible UI control in this interface. Model-specific form metadata can be added later if needed, but execution correctness only needs input and output capabilities.

### Model Registry

`ModelRegistry` is a lookup table with duplicate protection:

```ts
export class ModelRegistry {
  private readonly specs = new Map<string, ModelSpec>()

  register(spec: ModelSpec): void
  get(kind: TaskKind, provider: string, model: string): ModelSpec
  getForTask(task: Task): ModelSpec
  list(): ModelSpec[]
}
```

The map key should be deterministic:

```ts
const modelKey = (key: ModelKey): string => `${key.kind}:${key.provider}:${key.model}`
```

Rules:

1. Duplicate registration is a boot-time error.
2. Missing model is a 422 domain error during config preparation and a task failure during lifecycle execution if a bad task record somehow exists.
3. The registry must not contain provider-specific business logic.

### Provider Router

`ProviderRouter` is the only `TaskProvider` injected into `TaskLifecycle`:

```ts
export class ProviderRouter implements TaskProvider {
  constructor(private readonly registry: ModelRegistry) {}

  async start(task: Task): Promise<ProviderStartResult> {
    const spec = this.registry.getForTask(task)
    return spec.start(spec.parseTask(task))
  }

  async poll(task: Task): Promise<ProviderPollResult> {
    const spec = this.registry.getForTask(task)
    return spec.poll(spec.parseTask(task))
  }

  async cancel(task: Task): Promise<void> {
    const spec = this.registry.getForTask(task)
    await spec.cancel?.(spec.parseTask(task))
  }
}
```

`TaskLifecycle` should continue to handle common lifecycle semantics:

1. Start queued tasks.
2. Mark running.
3. Persist submitted external task ids.
4. Poll async tasks.
5. Retry transport failures.
6. Complete terminal outputs.
7. Persist output resources.
8. Run generic output post-processing before task completion is persisted.

Provider specs should not update task records directly.

## Target Directory Structure

Use this structure:

```text
apps/api/src/modules/tasks/
  config/
    media-envelope.ts
    task-config.ts
    task-config-assembler.ts
    validation-error.ts

  models/
    model-key.ts
    model-registry.ts
    model-spec.ts
    provider-router.ts
    register-models.ts

  output/
    output-post-processor.ts
    video-cover-generator.ts
    video-frame-extractor.ts

  providers/
    dev/
      image.spec.ts
      video.spec.ts

    google/
      common/client.ts
      common/errors.ts
      common/media.ts
      image/gemini.spec.ts
      image/gemini.mapper.ts
      image/gemini.test.ts
      video/veo.spec.ts
      video/veo.mapper.ts
      video/veo.test.ts

    volcengine/
      common/client.ts
      common/errors.ts
      common/model-aliases.ts
      image/seedream.spec.ts
      image/seedream.mapper.ts
      image/seedream.test.ts
      video/seedance.spec.ts
      video/seedance.mapper.ts
      video/seedance.test.ts
```

Provider clients own HTTP and authentication. Mappers own pure request/response conversions. Specs coordinate schema, capability, pricing, task mode, and lifecycle calls.

## Workflow Module Changes

The workflow module should retain its scheduling and media resolution responsibilities.

Keep these responsibilities where they are:

1. `run-executor.ts`: run reconciliation and flow-group scheduling.
2. `node-executor.ts`: single node execution, state transitions, and task linking.
3. `media-selection.ts`: edge media selection and conversion into `MediaInput`.
4. `validation.ts`: canvas and flow-group validation.

Change task config assembly as follows:

1. Replace provider-independent image/video config builders in `workflows/task-config.ts`.
2. Convert resolved media inputs into `MediaEnvelope`.
3. Call `TaskConfigAssembler.prepare`.
4. Pass final `TaskConfig` to `TasksService.createTask`.

Target flow:

```ts
const media = mediaEnvelopeFromResolvedInputs(inputs)
const taskConfig = this.taskConfigAssembler.prepare({
  draft: node.data.config.task,
  media,
})
```

`WorkflowNodeExecutor` should receive `TaskConfigAssembler` through its dependencies. This keeps workflow execution testable and avoids importing the global registry directly inside workflow scheduling code.

## Tasks Service Changes

`TasksService.createTask` must validate through the model spec before estimating cost or persisting:

```ts
const spec = this.modelRegistry.get(input.config.kind, input.config.provider, input.config.model)
const config = spec.parseConfig(input.config)
const pricingInput = spec.getPricingInput(config)
const pricing = await this.pricingService.estimate(pricingInput)
const mode = spec.getTaskMode(config)
const inputResources = spec.collectInputResources(config)
```

Then create the task using:

```ts
kind: config.kind
mode
provider: config.provider
model: config.model
config
```

Remove central model-specific logic from:

```text
apps/api/src/modules/tasks/domain.ts
apps/api/src/modules/tasks/pricing.ts
apps/api/src/modules/workflows/task-config.ts
```

These files may remain, but they should only contain generic helpers that do not branch on provider or model.

## Database Design

Keep the existing task table shape:

```text
tasks.kind
tasks.mode
tasks.provider
tasks.model
tasks.config jsonb
```

This is the right storage model because provider/model params are heterogeneous.

Required constraints at the application layer:

1. `tasks.kind` must match `tasks.config.kind`.
2. `tasks.provider` must match `tasks.config.provider`.
3. `tasks.model` must match `tasks.config.model`.
4. `tasks.mode` must equal `spec.getTaskMode(task.config)`.

Do not add provider-specific columns. Use `providerMetadata` for provider-specific execution metadata such as upstream request ids, operation names, and polling details.

## Provider Spec Examples

### Google Veo

Params:

```ts
const GoogleVeoParamsSchema = z.object({
  aspectRatio: z.enum(['16:9', '9:16']).default('16:9'),
  resolution: z.enum(['720p', '1080p', '4k']).default('720p'),
  durationSeconds: z.union([z.literal(4), z.literal(6), z.literal(8)]).default(8),
  personGeneration: z.enum(['allow_all', 'allow_adult']).default('allow_all'),
})
```

Spec responsibilities:

1. Reject unsupported media combinations.
2. Require image data conversion for first frame, last frame, and reference images.
3. Use async task mode.
4. Price by `duration_second`.
5. Map submitted operation name to `externalTaskId`.
6. Poll operation until done.
7. Normalize provider video output into `generated_video` resources.
8. Include provider-returned poster or first-frame images as `video_cover` only when the provider guarantees the image is the generated video's first displayable frame.

### Google Gemini Image

Params:

```ts
const GoogleGeminiImageParamsSchema = z.object({
  aspectRatio: z.string().default('1:1'),
  imageSize: z.string().default('1K'),
  webSearch: z.boolean().default(false),
  imageSearch: z.boolean().default(false),
  thinkingLevel: z.enum(['minimal', 'high']).optional(),
  includeThoughts: z.boolean().default(false),
  count: z.number().int().min(1).max(16).default(1),
})
```

Spec responsibilities:

1. Enforce per-model aspect ratio and size support.
2. Enforce grounding and thinking capability per model.
3. Validate reference image mime type and count.
4. Use sync task mode if the provider call returns final images directly.
5. Price by `image` or `token`, depending on the pricing rules defined for the model.
6. Normalize inline image outputs into durable output resources.

### Volcengine Seedream

Params:

```ts
const VolcengineSeedreamParamsSchema = z.object({
  size: z.string(),
  outputFormat: z.enum(['png', 'jpeg']).optional(),
  sequentialImageGeneration: z.enum(['auto', 'disabled']).optional(),
  maxImages: z.number().int().min(1).max(16).optional(),
  optimizePrompt: z.boolean().default(false),
  watermark: z.boolean().optional(),
  webSearch: z.boolean().default(false),
  count: z.number().int().min(1).max(16).default(1),
})
```

Spec responsibilities:

1. Enforce model-specific output format support.
2. Enforce model-specific resolution support.
3. Resolve model aliases before provider calls.
4. Select model-specific API key when aliases are used.
5. Normalize generated image URLs into `generated_image` resources.

### Volcengine Seedance

Params:

```ts
const VolcengineSeedanceParamsSchema = z.object({
  ratio: z.enum(['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive']).default('16:9'),
  resolution: z.enum(['480p', '720p', '1080p']).default('720p'),
  durationSeconds: z.number().int().min(1),
  serviceTier: z.enum(['default', 'flex']).optional(),
  generateAudio: z.boolean().optional(),
  returnLastFrame: z.boolean().default(false),
  cameraFixed: z.boolean().optional(),
  webSearch: z.boolean().default(false),
})
```

Spec responsibilities:

1. Derive the generation scene from media inputs.
2. Enforce per-model scene support.
3. Enforce per-model reference image, video, and audio limits.
4. Enforce duration and resolution support.
5. Use async task mode.
6. Poll provider task id.
7. Normalize video and optional last frame outputs.
8. Include provider-returned first-frame/poster images as `video_cover` only when their semantics are guaranteed; otherwise let output post-processing extract the cover.

## Provider Gateway Rules

Provider clients must be small and explicit:

1. Read provider credentials from typed environment config.
2. Build HTTP requests.
3. Apply provider-specific authentication.
4. Apply provider-specific timeout and rate limit behavior.
5. Translate HTTP and provider errors into typed provider errors.
6. Never write repositories.
7. Never know workflow ids or workflow node ids.
8. Never calculate Mina task status transitions.

Provider mappers must be pure:

1. `TaskConfig -> provider request`
2. `provider response -> ProviderStartResult`
3. `provider poll response -> ProviderPollResult`
4. `provider output -> NodeExecutionOutput`

Do not hide HTTP calls inside mappers.

## Error Handling

Use these error categories:

1. Config validation error: bad user/model parameters before task creation. Return 422 from routes or fail workflow run creation.
2. Provider terminal failure: provider accepted the request but completed with failure. Return `ProviderStartResult` or `ProviderPollResult` with `status: 'failed'`.
3. Transport failure: timeout, network error, 429, 5xx. Throw a provider error and let `TaskLifecycle` retry according to existing retry rules.
4. Internal invariant failure: bad registry state, duplicate model registration, impossible task config. Throw and fail fast in tests or boot.

Do not throw provider terminal failures as transport errors. Terminal provider failures should not consume retry budget unless a specific model spec intentionally classifies an upstream error as retryable transport failure.

## Pricing Rules

Pricing belongs to model specs:

```ts
getPricingInput(config): PricingEstimateRequest
```

Examples:

1. Image count pricing: `billingMetric: 'image'`, `usageAmount: params.count`.
2. Video duration pricing: `billingMetric: 'duration_second'`, `usageAmount: params.durationSeconds`.
3. Token pricing: `billingMetric: 'token'`, `usageAmount` derived from provider-estimated or request-level values when available.
4. Pricing key: model spec owns provider-specific dimensions such as resolution, service tier, fast tier, or quality mode.

`PricingService` should stay provider-agnostic. It receives a normalized `PricingEstimateRequest` and applies database pricing rules.

## Resource Collection Rules

Input resource collection belongs to model specs:

```ts
collectInputResources(config): MediaInput[]
```

Rules:

1. Include only resources the provider request will actually use.
2. Keep output order stable for repeatable tests.
3. Preserve `role`, `kind`, `url`, `metadata`, and `source`.
4. Do not derive input resources by scanning arbitrary JSON fields.

## Video Cover Output Rules

Every successful video-generation task must produce a durable first-frame cover image output. This output is for frontend display needs such as video cards, media grids, preview posters, and timeline thumbnails.

This is a platform-level output invariant:

```text
successful video_generation task -> generated_video + video_cover
```

### Resource Role

Add a new output role:

```ts
export const ResourceRoleSchema = z.enum([
  'generated_image',
  'generated_video',
  'video_cover',
  'last_frame',
  'first_frame',
  'reference_image',
  'reference_audio',
  'reference_video',
])
```

`video_cover` means:

1. `kind: 'image'`.
2. The image represents the first displayable frame of a generated video.
3. The image is an output resource, not a workflow input role.
4. The image is stable enough for frontend poster/cover use.
5. The image should not be used as the `first_frame` input role unless workflow code explicitly converts it into a media input for another task.

Keep `first_frame` as an input role. Do not reuse `first_frame` for output covers because that would mix input semantics with display artifact semantics.

### Output Shape

A completed video task output should look like this:

```ts
{
  resources: [
    {
      id: `${task.id}:video:0`,
      kind: 'video',
      role: 'generated_video',
      index: 0,
      url: '...',
    },
    {
      id: `${task.id}:video-cover:0`,
      kind: 'image',
      role: 'video_cover',
      index: 1,
      url: '...',
      metadata: {
        sourceVideoResourceId: `${task.id}:video:0`,
        frameTimeSeconds: 0,
      },
    },
  ],
  variables: {
    videoUrls: ['...'],
    videoCoverUrls: ['...'],
  },
}
```

Add `videoCoverUrls` to `NodeExecutionOutput.variables`.

### Generation Strategy

Use a generic post-processor instead of making each provider implement cover generation differently:

```text
provider result -> NodeExecutionOutput -> OutputPostProcessor -> final NodeExecutionOutput
```

`OutputPostProcessor` must:

1. Detect `video_generation` tasks.
2. Find each `generated_video` output.
3. Check whether a `video_cover` already exists for that video.
4. If a provider already returned a usable first-frame or poster image, normalize it to `video_cover`.
5. If no cover exists, call `VideoCoverGenerator` to extract frame `0` from the video.
6. Add the generated `video_cover` resource before task completion is persisted.
7. Rebuild output variables after adding cover resources.

Provider specs should still expose provider-returned first-frame/poster artifacts if available, but they should not decide the platform invariant. The post-processor owns the invariant.

### Provider-Returned Covers

Some providers may return a first frame, poster, thumbnail, or preview image with the video result. Model mappers may include that image as a `video_cover` resource directly when the provider guarantees it represents the generated video's first displayable frame.

If the provider returns an image whose semantics are not guaranteed, place the raw detail in `providerMetadata` or resource `metadata`, then let `VideoCoverGenerator` produce the canonical `video_cover`.

### Frame Extraction

`VideoCoverGenerator` should be an infrastructure service behind a small interface:

```ts
export interface VideoCoverGenerator {
  generateCover(input: {
    accountId: string
    taskId: string
    video: NodeOutputResource
  }): Promise<NodeOutputResource>
}
```

Implementation rules:

1. Download or stream the generated video from object storage or remote provider URL.
2. Extract frame at `0` seconds, or the first decodable frame if exact `0` is not decodable.
3. Store the cover image in object storage under the task output namespace.
4. Return a `NodeOutputResource` with `kind: 'image'`, `role: 'video_cover'`, and stable metadata.
5. Keep extraction behind an interface so local tests can use a fake generator.

Do not run ffmpeg or media processing directly from provider specs.

### Failure Policy

The preferred behavior is strict: if the video succeeds but cover generation fails, the task should fail with a clear internal error.

Reason:

1. The cover is a required output invariant for video tasks.
2. A succeeded task without a cover creates inconsistent frontend and workflow behavior.
3. Retrying the task lifecycle can recover transient storage or media processing failures.

If product requirements later allow videos without covers, introduce an explicit `coverStatus` field or resource metadata policy. Do not silently mark a video task as succeeded without a cover.

### Last Frame Is Separate

`video_cover` and `last_frame` are different outputs:

1. `video_cover` is always required for successful video tasks.
2. `last_frame` is optional and only exists when the model/provider supports and requests it.
3. `video_cover` is for display/poster use.
4. `last_frame` is a generative workflow artifact for chaining tail-frame workflows.

## Application Composition

Register model specs in application dependency composition:

```ts
const modelRegistry = new ModelRegistry()
registerTaskModels(modelRegistry, {
  googleClient,
  volcengineClient,
  devClients,
})

const taskProvider = new ProviderRouter(modelRegistry)
const outputPostProcessor = new OutputPostProcessor(videoCoverGenerator)
const tasksService = new TasksService(
  taskRepository,
  pricingService,
  taskProvider,
  taskEventLog,
  modelRegistry,
  outputPostProcessor,
)
const taskConfigAssembler = new TaskConfigAssembler(modelRegistry)
const workflowsService = new WorkflowsService(workflowRepository, tasksService, workflowEventLog, taskConfigAssembler)
```

If constructor signatures become long, use a small dependency object. Do not introduce a DI framework.

## Implementation Checklist

Implement the complete target architecture in one coherent refactor:

1. Replace the shared `TaskConfigSchema` with the canonical envelope and add `TaskDraftConfigSchema`.
2. Update workflow node config schemas to store `TaskDraftConfig` instead of global image/video task config variants.
3. Add `MediaEnvelope` and a pure converter from resolved workflow media inputs.
4. Add `ModelSpec`, `ModelRegistry`, and `ProviderRouter`.
5. Add `TaskConfigAssembler` and inject it into workflow node execution.
6. Move task config preparation out of `workflows/task-config.ts` and into model specs.
7. Move pricing input construction out of central `tasks/pricing.ts` and into model specs.
8. Move task mode calculation out of central kind-only logic and into model specs.
9. Move input resource collection out of workflow helpers and into model specs.
10. Add `video_cover` to resource roles and `videoCoverUrls` to node output variables.
11. Add `OutputPostProcessor`, `VideoCoverGenerator`, and a fake cover generator for tests.
12. Make task completion run output post-processing before persisting terminal output resources.
13. Implement dev image and dev video specs first so existing tests have a local provider.
14. Implement Google image and video specs from the legacy Lumina Google provider code.
15. Implement Volcengine image and video specs from the legacy Lumina Volcengine provider code.
16. Keep provider HTTP clients and request/response mappers separate from specs.
17. Update API routes and tests to validate the new task config and workflow node draft config shapes.
18. Update pricing seed data or pricing tests to match provider/model pricing keys produced by specs.
19. Update architecture documentation after code is changed.

This checklist is not a migration plan. It is the complete target-state implementation order.

## Required Tests

Add or update tests at these levels:

### Model Spec Tests

Each model spec must test:

1. Valid params parse and defaults.
2. Invalid params reject with useful messages.
3. Unsupported media combinations reject.
4. Input resource collection.
5. Pricing input.
6. Provider request mapping.
7. Provider output mapping.

### Registry Tests

Test:

1. Duplicate registration fails.
2. Missing model lookup fails.
3. Lookup by `kind/provider/model` succeeds.
4. `ProviderRouter` dispatches to the expected spec.

### Task Service Tests

Test:

1. `createTask` persists canonical config.
2. `createTask` uses spec-derived mode.
3. `createTask` uses spec-derived pricing input.
4. `createTask` persists spec-derived input resources.
5. Invalid config fails before task creation.
6. Successful video task completion adds `video_cover` output before persistence.
7. Video task completion fails clearly if cover generation fails.

### Workflow Tests

Test:

1. Ordinary canvas passes current MediaView resources into `MediaEnvelope`.
2. Flow-group execution passes run output resources into `MediaEnvelope`.
3. Workflow execution does not branch on provider-specific parameters.
4. Required media failures still produce existing workflow error semantics.
5. Provider/model media capability errors fail run creation or node execution predictably.
6. Flow-group run outputs can select `generated_video` separately from `video_cover`.

### Provider Tests

Use mocked HTTP clients for provider tests. Do not call real Google or Volcengine endpoints in unit tests.

Test:

1. Request body shape.
2. Authentication header selection.
3. Alias resolution.
4. Pending status mapping.
5. Succeeded status mapping.
6. Failed status mapping.
7. Retryable vs non-retryable error classification.

### Output Post-Processor Tests

Test:

1. Adds `video_cover` when a video output has no cover.
2. Reuses provider-returned `video_cover` when present.
3. Adds `videoCoverUrls` variables.
4. Keeps `last_frame` separate from `video_cover`.
5. Fails video task completion when cover generation fails.
6. Does not run cover generation for image tasks.

## Acceptance Criteria

The refactor is complete when:

1. `TaskConfig` has the canonical envelope shape and no provider/model-specific top-level fields.
2. Workflow execution uses `TaskConfigAssembler` and does not import Google or Volcengine provider code.
3. `TasksService` uses `ModelRegistry` for config parsing, task mode, pricing input, and resource collection.
4. `TaskLifecycle` only depends on `TaskProvider`, and the injected implementation is `ProviderRouter`.
5. Provider clients do not import workflow modules or repositories.
6. Provider specs do not update database records directly.
7. Adding a new model requires adding a spec, mapper/client code if needed, tests, and a registry registration.
8. No central file contains provider/model-specific branches for pricing, config preparation, or lifecycle dispatch.
9. Existing ordinary canvas and flow-group execution semantics remain intact.
10. Every successful `video_generation` task output includes a `video_cover` image resource and `videoCoverUrls`.
11. `last_frame` remains optional and separate from `video_cover`.
12. `bun run check` passes.

## Anti-Patterns To Avoid

Avoid these patterns:

1. A global `VideoGenerationConfigSchema` that grows every provider's fields.
2. A central `switch (provider)` in `TasksService`.
3. A central `switch (model)` in `pricing.ts`.
4. Provider clients that return raw upstream responses to task lifecycle.
5. Workflow code that knows `aspectRatio`, `outputFormat`, `serviceTier`, or similar provider parameters.
6. Mappers that perform HTTP calls.
7. Specs that write repositories.
8. Runtime config accepted without Zod parsing.
9. Dynamic plugin loading before there is a real operational need.
10. Over-generalized UI/control metadata inside the execution model.
11. Successful video tasks without a durable `video_cover` output.

## Design Rationale

This design deliberately keeps the core small:

```text
TaskConfig = stable envelope + params
ModelSpec = one model's rules and behavior
ModelRegistry = lookup only
ProviderRouter = lifecycle dispatch only
Provider client = external gateway only
```

The complexity does not disappear; it is placed where it naturally belongs. Google Veo rules live with Google Veo. Volcengine Seedance rules live with Volcengine Seedance. Workflow and task lifecycle remain stable, which is the most important property for correctness as providers and models increase.
