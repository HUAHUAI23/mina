# 02 — Data Model

All tables follow existing schema conventions in
`apps/api/src/db/schema.ts`: `text` primary keys, `account_id`
ownership references, `...timestamps()`, soft delete via `deleted_at`
where listed, partial unique indexes for active rows, semantic index
names (`<table>_<cols>_idx` / `_uidx`).

## Naming rationale

- **`story_assets`** (not `asset_entities`, not `project_entities`):
  "story" scopes it to the creative production domain and avoids
  colliding with the existing `asset_library_*` namespace; "asset"
  matches the user-facing concept (资产库). An entity row *is* the
  asset; images/voices are bindings under it.
- **`agent_*`** prefix for chain-runtime tables (`agent_prompt_modules`,
  `agent_plans`, `agent_plan_items`): the frontend already calls the
  canvas chat "agent chat", and the API module is `modules/agent`.
- **`generation_profiles`** (not `model_preferences`): it is a complete
  generation default profile (model + resolution + duration), not a
  per-model preference map.

## 1. New table: `story_assets`

```ts
export const storyAssets = pgTable(
  'story_assets',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull().references(() => accounts.id),
    projectId: text('project_id').notNull().references(() => projects.id),
    assetType: text('asset_type').$type<StoryAssetType>().notNull(),
    // 'character' | 'scene' | 'prop'
    name: text('name').notNull(),            // display name, curation language
    refKey: text('ref_key').notNull(),       // 'char_lihua' — type-prefixed slug
    description: text('description'),
    attributes: jsonb('attributes')
      .$type<Record<string, string | number | boolean>>()
      .notNull().default({}),
    createdByUserId: text('created_by_user_id').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index('story_assets_project_type_idx').on(table.projectId, table.assetType, table.updatedAt),
    index('story_assets_account_idx').on(table.accountId, table.updatedAt),
    uniqueIndex('story_assets_project_ref_key_uidx')
      .on(table.projectId, table.refKey)
      .where(sql`${table.deletedAt} is null`),
  ],
)
```

`refKey` generation: `<typePrefix>_<slug(name)>`, prefixes
`char|scene|prop`; collision resolved with a short numeric suffix.
refKey is immutable after creation (LLM-facing stability); renaming an
asset changes `name` only.

## 2. New table: `story_asset_images`

```ts
export const storyAssetImages = pgTable(
  'story_asset_images',
  {
    id: text('id').primaryKey(),
    storyAssetId: text('story_asset_id').notNull()
      .references(() => storyAssets.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull().references(() => accounts.id),
    mediaObjectId: text('media_object_id').notNull().references(() => mediaObjects.id),
    refKey: text('ref_key').notNull(),        // 'img_<shortId>' — globally unique
    role: text('role').$type<StoryAssetImageRole>().notNull().default('reference'),
    // 'identity_anchor' | 'reference' | 'auxiliary'
    profile: jsonb('profile').$type<StoryAssetImageProfile>(),
    // optional analyzed tags: framing, faceVisibility, viewAngle, tags[]
    isPrimary: boolean('is_primary').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index('story_asset_images_asset_sort_idx').on(table.storyAssetId, table.sortOrder),
    index('story_asset_images_media_idx').on(table.mediaObjectId),
    uniqueIndex('story_asset_images_ref_key_uidx')
      .on(table.refKey).where(sql`${table.deletedAt} is null`),
    uniqueIndex('story_asset_images_primary_uidx')
      .on(table.storyAssetId)
      .where(sql`${table.isPrimary} = true and ${table.deletedAt} is null`),
  ],
)
```

Images reference `media_objects` directly (the asset-library rule:
business index over managed media, no second file identity). A new
media purpose `story_asset` is added for direct uploads; binding an
existing library/canvas media object reuses its id.

## 3. New table: `story_asset_voices`

```ts
export const storyAssetVoices = pgTable(
  'story_asset_voices',
  {
    id: text('id').primaryKey(),
    storyAssetId: text('story_asset_id').notNull()
      .references(() => storyAssets.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull().references(() => accounts.id),
    mediaObjectId: text('media_object_id').notNull().references(() => mediaObjects.id),
    refKey: text('ref_key').notNull(),        // 'voice_<shortId>'
    note: text('note'),
    isPrimary: boolean('is_primary').notNull().default(false),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index('story_asset_voices_asset_idx').on(table.storyAssetId),
    uniqueIndex('story_asset_voices_ref_key_uidx')
      .on(table.refKey).where(sql`${table.deletedAt} is null`),
    uniqueIndex('story_asset_voices_primary_uidx')
      .on(table.storyAssetId)
      .where(sql`${table.isPrimary} = true and ${table.deletedAt} is null`),
  ],
)
```

Voices are only meaningful on `character` assets; the service rejects
binding to other types (DB stays permissive).

## 4. New table: `generation_profiles`

```ts
export const generationProfiles = pgTable(
  'generation_profiles',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull().references(() => accounts.id),
    projectId: text('project_id').references(() => projects.id),
    // null projectId = account default; project row overrides it wholesale
    imageDefaults: jsonb('image_defaults').$type<ImageGenerationDefaults>().notNull(),
    // { providerName, model, size | aspectRatio+resolution }
    videoDefaults: jsonb('video_defaults').$type<VideoGenerationDefaults>().notNull(),
    // { providerName, model, resolution, aspectRatio, defaultDurationSeconds,
    //   characterImageFallback: boolean }
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('generation_profiles_account_default_uidx')
      .on(table.accountId).where(sql`${table.projectId} is null`),
    uniqueIndex('generation_profiles_account_project_uidx')
      .on(table.accountId, table.projectId)
      .where(sql`${table.projectId} is not null`),
  ],
)
```

The jsonb payloads are validated by contracts schemas **and** against
the task `ModelRegistry` (model exists, duration within the model's
allowed set) at write time. Resolution order at read time:
project row → account row → code default
(`getDefaultGenerationProfile()` in contracts).

## 5. New table: `agent_prompt_modules`

```ts
export const agentPromptModules = pgTable(
  'agent_prompt_modules',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull().references(() => accounts.id),
    chainKey: text('chain_key').$type<ChainKey>().notNull(),
    name: text('name').notNull(),
    content: text('content').notNull(),       // markdown, prompt fragment
    isEnabled: boolean('is_enabled').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index('agent_prompt_modules_account_chain_idx')
      .on(table.accountId, table.chainKey, table.sortOrder),
  ],
)
```

Code ships default module sets per chain (seed content in the data
layer). An account with zero rows for a chain uses the defaults; the
first edit copies defaults into rows ("fork on write"). System
protocol and output protocol are **not** in this table — they are
code-built-ins.

## 6. New tables: `agent_plans`, `agent_plan_items`

```ts
export const agentPlans = pgTable(
  'agent_plans',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull().references(() => accounts.id),
    projectId: text('project_id').references(() => projects.id),
    workflowId: text('workflow_id').references(() => workflows.id),
    threadId: text('thread_id').references(() => chatThreads.id),
    assistantMessageId: text('assistant_message_id').references(() => chatMessages.id),
    chainKey: text('chain_key').$type<ChainKey>().notNull(),
    status: text('status').$type<AgentPlanStatus>().notNull(),
    // 'planned' | 'partial' | 'blocked' | 'failed'
    sourceText: text('source_text').notNull(),     // the consumed storyboard/narrative
    planGraph: jsonb('plan_graph').$type<PlanGraph>(),
    errorCode: text('error_code'),
    errorMessageKey: text('error_message_key'),
    errorParams: jsonb('error_params').$type<Record<string, string | number | boolean>>(),
    errorDebugMessage: text('error_debug_message'),
    ...timestamps(),
  },
  (table) => [
    index('agent_plans_account_created_idx').on(table.accountId, table.createdAt),
    index('agent_plans_thread_idx').on(table.threadId, table.createdAt),
    index('agent_plans_workflow_idx').on(table.workflowId, table.createdAt),
  ],
)

export const agentPlanItems = pgTable(
  'agent_plan_items',
  {
    id: text('id').primaryKey(),
    planId: text('plan_id').notNull()
      .references(() => agentPlans.id, { onDelete: 'cascade' }),
    itemIndex: integer('item_index').notNull(),     // shot index, 1-based
    title: text('title').notNull(),
    status: text('status').$type<AgentPlanItemStatus>().notNull(),
    // 'planned' | 'blocked' | 'failed'
    sourceText: text('source_text').notNull(),      // this shot's storyboard text
    generatedText: text('generated_text'),          // raw model output (pre-compile)
    durationSeconds: integer('duration_seconds'),
    compileReport: jsonb('compile_report').$type<CompileReport>(),
    errorCode: text('error_code'),
    errorDebugMessage: text('error_debug_message'),
    ...timestamps(),
  },
  (table) => [
    index('agent_plan_items_plan_idx').on(table.planId, table.itemIndex),
    uniqueIndex('agent_plan_items_plan_index_uidx').on(table.planId, table.itemIndex),
  ],
)
```

Plan error fields follow the established `LocalizedErrorDetails`
pattern (semantic code/key/params/debug; localize at response time).
`generatedText` is kept per item so future revision chains can rewrite
one shot without regenerating the rest.

## 7. Altered tables

### `chat_assistant_runs` — add chain identity

```ts
chainKey: text('chain_key').$type<ChainKey>(),   // null = conversation.general
```

Set at run creation from the message request; used by run draining to
dispatch the chain instead of the plain responder. Durable so retries
and scheduler recovery re-enter the same chain.

### `chat_messages` — no change

The user's chain choice lives on the run; the assistant's plan
reference lives in message parts (below). No new message columns.

### Chat message parts — new part types (jsonb content, no migration)

`ChatMessagePart` union gains:

```ts
{ type: 'plan'; planId: string; chainKey: ChainKey; status: AgentPlanStatus;
  itemCount: number; blockedCount: number; failedCount: number }
{ type: 'document'; protocol: 'storyboard' | 'markdown'; text: string }
{ type: 'asset_changes'; applied: AssetOperationSummary[]; rejected: AssetOperationSummary[] }
```

The storage model (`chat_message_parts.content` jsonb + `type` text)
already supports new part types without schema change — this is the
extension path the chat design reserved.

### `media_objects` — new purpose value

Add `story_asset` to the media purpose union in contracts (no schema
change; purpose is a text column validated in contracts).

## 8. Ownership & deletion semantics

- All new tables carry `account_id` per the tenant ownership rule.
- `story_assets` soft-delete cascades logically (service hides child
  images/voices of deleted assets; rows keep FK integrity).
- Deleting a story asset never deletes `media_objects`.
- `agent_plans` are immutable history once written; a re-run creates a
  new plan. (Revision chains in v3 will add `supersedes_plan_id`.)
- WS chain phase events are ephemeral (not persisted); the durable
  record is the plan row + plan items + the `plan` message part.
