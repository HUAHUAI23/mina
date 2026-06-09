import type { User } from '@mina/contracts/modules/accounts'
import type {
  NodeMediaViewState,
  WorkflowEdgeData,
  WorkflowNodeData,
  WorkflowNodeType,
} from '@mina/contracts/modules/canvas'
import type { WorkflowMediaLinkConnection } from '@mina/contracts/modules/media'
import type { PricingRule } from '@mina/contracts/modules/pricing'
import type {
  NodeExecutionOutput,
  ResourceKind,
  ResourceRole,
  TaskConfig,
  TaskKind,
  TaskMode,
  TaskStatus,
} from '@mina/contracts/modules/tasks'
import type {
  WorkflowRunMode,
  WorkflowRunNodeState,
  WorkflowRunStatus,
} from '@mina/contracts/modules/workflows'
import { sql } from 'drizzle-orm'
import {
  boolean,
  bytea,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

export type MediaObjectStatus = 'uploading' | 'ready' | 'failed' | 'deleted'
export type MediaObjectOrigin = 'user_upload' | 'task_output' | 'external_import' | 'system_generated'
export type MediaObjectPurpose =
  | 'task_input'
  | 'task_output'
  | 'workflow_slot'
  | 'temporary'
  | 'preview'
  | 'public_library'
  | 'asset_library'
export type MediaObjectRetention = 'temporary' | 'task_scoped' | 'project_scoped' | 'library'
export type AssetLibraryItemStatus = 'active' | 'archived' | 'deleted' | 'unavailable'
export type AssetLibrarySourceType = 'local_upload' | 'workflow_output' | 'external_import' | 'system'
export type AssetTagSource = 'system' | 'custom'
export type AssetSystemTagKey = 'other' | 'person' | 'scene' | 'object' | 'style' | 'sound_effect'
export type OAuthClientType = 'public' | 'confidential'
export type OAuthConsentStatus = 'granted' | 'revoked'
export type OAuthGrantType = 'authorization_code' | 'refresh_token' | 'client_credentials'
export type OAuthProvider = 'google' | 'github'
export type OAuthResponseType = 'code'
export type SessionRevocationReason = 'logout' | 'rotation' | 'security' | 'expired'

const timestamps = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    username: text('username'),
    email: text('email').notNull(),
    displayName: text('display_name'),
    avatarStorageKey: text('avatar_storage_key'),
    avatarMimeType: text('avatar_mime_type'),
    avatarUpdatedAt: timestamp('avatar_updated_at', { withTimezone: true }),
    preferredLocale: text('preferred_locale'),
    role: text('role').$type<User['role']>().notNull().default('user'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [uniqueIndex('users_email_uidx').on(table.email), uniqueIndex('users_username_uidx').on(table.username)],
)

export const userPasswordCredentials = pgTable(
  'user_password_credentials',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => users.id),
    passwordHash: text('password_hash').notNull(),
    passwordVersion: integer('password_version').notNull().default(1),
    mustResetPassword: boolean('must_reset_password').notNull().default(false),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    ...timestamps(),
  },
)

export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    provider: text('provider').$type<OAuthProvider>().notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    email: text('email'),
    profile: jsonb('profile').$type<Record<string, unknown>>(),
    accessTokenHash: text('access_token_hash'),
    refreshTokenHash: text('refresh_token_hash'),
    tokenType: text('token_type'),
    scope: text('scope'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index('oauth_accounts_user_idx').on(table.userId),
    uniqueIndex('oauth_accounts_provider_account_uidx').on(table.provider, table.providerAccountId),
  ],
)

export const oauthClients = pgTable(
  'oauth_clients',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').references(() => accounts.id),
    clientId: text('client_id').notNull(),
    clientSecretHash: text('client_secret_hash'),
    clientType: text('client_type').$type<OAuthClientType>().notNull(),
    name: text('name').notNull(),
    redirectUris: jsonb('redirect_uris').$type<string[]>().notNull(),
    allowedGrantTypes: jsonb('allowed_grant_types').$type<OAuthGrantType[]>().notNull(),
    allowedResponseTypes: jsonb('allowed_response_types').$type<OAuthResponseType[]>().notNull(),
    allowedScopes: jsonb('allowed_scopes').$type<string[]>().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index('oauth_clients_account_idx').on(table.accountId),
    uniqueIndex('oauth_clients_client_id_uidx').on(table.clientId),
  ],
)

export const oauthAuthorizationCodes = pgTable(
  'oauth_authorization_codes',
  {
    id: text('id').primaryKey(),
    codeHash: text('code_hash').notNull(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClients.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    redirectUri: text('redirect_uri').notNull(),
    scope: text('scope').notNull(),
    codeChallenge: text('code_challenge'),
    codeChallengeMethod: text('code_challenge_method'),
    nonce: text('nonce'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('oauth_authorization_codes_hash_uidx').on(table.codeHash),
    index('oauth_authorization_codes_client_user_idx').on(table.clientId, table.userId),
    index('oauth_authorization_codes_expires_idx').on(table.expiresAt),
  ],
)

export const oauthRefreshTokens = pgTable(
  'oauth_refresh_tokens',
  {
    id: text('id').primaryKey(),
    tokenHash: text('token_hash').notNull(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClients.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    scope: text('scope').notNull(),
    parentTokenId: text('parent_token_id'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revocationReason: text('revocation_reason').$type<SessionRevocationReason>(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('oauth_refresh_tokens_hash_uidx').on(table.tokenHash),
    index('oauth_refresh_tokens_client_user_idx').on(table.clientId, table.userId),
    index('oauth_refresh_tokens_expires_idx').on(table.expiresAt),
  ],
)

export const oauthConsents = pgTable(
  'oauth_consents',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClients.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    scope: text('scope').notNull(),
    status: text('status').$type<OAuthConsentStatus>().notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('oauth_consents_client_user_scope_uidx').on(table.clientId, table.userId, table.scope),
    index('oauth_consents_user_idx').on(table.userId),
  ],
)

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revocationReason: text('revocation_reason').$type<SessionRevocationReason>(),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_uidx').on(table.tokenHash),
    index('sessions_user_idx').on(table.userId),
    index('sessions_expiry_idx').on(table.expiresAt),
  ],
)

export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    storageRootPrefix: text('storage_root_prefix').notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index('accounts_owner_user_idx').on(table.ownerUserId),
    uniqueIndex('accounts_storage_root_uidx').on(table.storageRootPrefix),
  ],
)

export const pricingRules = pgTable(
  'pricing_rules',
  {
    id: text('id').primaryKey(),
    taskKind: text('task_kind').$type<PricingRule['taskKind']>().notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    pricingKey: text('pricing_key'),
    billingMetric: text('billing_metric').$type<PricingRule['billingMetric']>().notNull(),
    unitPrice: numeric('unit_price', { precision: 16, scale: 6 }).notNull(),
    currency: text('currency').notNull(),
    activeFrom: timestamp('active_from', { withTimezone: true }).notNull(),
    activeTo: timestamp('active_to', { withTimezone: true }),
    priority: integer('priority').notNull().default(0),
    ...timestamps(),
  },
  (table) => [
    index('pricing_rules_lookup_idx').on(
      table.taskKind,
      table.provider,
      table.model,
      table.pricingKey,
      table.billingMetric,
    ),
  ],
)

export const tasks = pgTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    idempotencyKey: text('idempotency_key'),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    kind: text('kind').$type<TaskKind>().notNull(),
    mode: text('mode').$type<TaskMode>().notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    status: text('status').$type<TaskStatus>().notNull(),
    config: jsonb('config').$type<TaskConfig>().notNull(),
    externalTaskId: text('external_task_id'),
    providerStatus: text('provider_status'),
    providerMetadata: jsonb('provider_metadata').$type<Record<string, unknown>>(),
    estimatedCost: numeric('estimated_cost', { precision: 16, scale: 6 }).notNull(),
    actualCost: numeric('actual_cost', { precision: 16, scale: 6 }),
    usageMetric: text('usage_metric').notNull(),
    estimatedUsageAmount: numeric('estimated_usage_amount', { precision: 16, scale: 6 }).notNull(),
    actualUsageAmount: numeric('actual_usage_amount', { precision: 16, scale: 6 }),
    output: jsonb('output').$type<NodeExecutionOutput>(),
    errorCode: text('error_code'),
    errorMessageKey: text('error_message_key'),
    errorParams: jsonb('error_params').$type<Record<string, string | number | boolean>>(),
    errorMessage: text('error_message'),
    errorDebugMessage: text('error_debug_message'),
    retryCount: integer('retry_count').notNull().default(0),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    lastPolledAt: timestamp('last_polled_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index('tasks_status_retry_idx').on(table.status, table.nextRetryAt),
    index('tasks_queued_start_idx').on(table.status, table.createdAt),
    index('tasks_async_poll_idx').on(table.status, table.mode, table.externalTaskId),
    index('tasks_account_created_idx').on(table.accountId, table.createdAt),
    uniqueIndex('tasks_idempotency_key_uidx').on(table.idempotencyKey),
  ],
)

export const taskResources = pgTable(
  'task_resources',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id),
    direction: text('direction').$type<'input' | 'output'>().notNull(),
    kind: text('kind').$type<ResourceKind>().notNull(),
    url: text('url').notNull(),
    role: text('role').$type<ResourceRole>(),
    outputIndex: integer('output_index'),
    mediaObjectId: text('media_object_id'),
    slot: text('slot'),
    slotItemId: text('slot_item_id'),
    slotOrder: integer('slot_order'),
    source: jsonb('source').$type<Record<string, unknown>>(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('task_resources_account_created_idx').on(table.accountId, table.createdAt),
    index('task_resources_media_object_idx').on(table.mediaObjectId),
    index('task_resources_task_idx').on(table.taskId),
    index('task_resources_task_preview_idx').on(table.taskId, table.direction, table.kind, table.role),
  ],
)

export const mediaObjects = pgTable(
  'media_objects',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    kind: text('kind').$type<ResourceKind>().notNull(),
    status: text('status').$type<MediaObjectStatus>().notNull(),
    bucket: text('bucket').notNull(),
    storageKey: text('storage_key').notNull(),
    url: text('url').notNull(),
    mimeType: text('mime_type'),
    byteSize: integer('byte_size').notNull().default(0),
    checksum: text('checksum'),
    width: integer('width'),
    height: integer('height'),
    durationSeconds: numeric('duration_seconds', { precision: 12, scale: 3 }),
    origin: text('origin').$type<MediaObjectOrigin>().notNull(),
    purpose: text('purpose').$type<MediaObjectPurpose>().notNull(),
    retention: text('retention').$type<MediaObjectRetention>().notNull(),
    parentMediaObjectId: text('parent_media_object_id'),
    sourceTaskId: text('source_task_id').references(() => tasks.id),
    sourceTaskResourceId: text('source_task_resource_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index('media_objects_account_created_idx').on(table.accountId, table.createdAt),
    index('media_objects_account_status_idx').on(table.accountId, table.status),
    index('media_objects_source_task_idx').on(table.sourceTaskId),
    uniqueIndex('media_objects_storage_key_uidx').on(table.storageKey),
  ],
)

export const taskEvents = pgTable(
  'task_events',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id),
    eventType: text('event_type').notNull(),
    message: text('message'),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('task_events_task_idx').on(table.taskId)],
)

export const workflows = pgTable(
  'workflows',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    name: text('name').notNull(),
    version: integer('version').notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [index('workflows_account_updated_idx').on(table.accountId, table.updatedAt)],
)

export const projects = pgTable(
  'projects',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    name: text('name').notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [index('projects_account_updated_idx').on(table.accountId, table.updatedAt)],
)

export const assetLibraryFolders = pgTable(
  'asset_library_folders',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdByUserId: text('created_by_user_id').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index('asset_library_folders_account_sort_idx').on(table.accountId, table.sortOrder, table.createdAt),
    uniqueIndex('asset_library_folders_account_slug_uidx')
      .on(table.accountId, table.slug)
      .where(sql`${table.deletedAt} is null`),
  ],
)

export const assetTags = pgTable(
  'asset_tags',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    source: text('source').$type<AssetTagSource>().notNull(),
    systemKey: text('system_key').$type<AssetSystemTagKey>(),
    color: text('color'),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
    usageCount: integer('usage_count').notNull().default(0),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index('asset_tags_account_sort_idx').on(table.accountId, table.sortOrder, table.name),
    uniqueIndex('asset_tags_account_slug_uidx')
      .on(table.accountId, table.slug)
      .where(sql`${table.deletedAt} is null`),
  ],
)

export const assetLibraryItems = pgTable(
  'asset_library_items',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    mediaObjectId: text('media_object_id')
      .notNull()
      .references(() => mediaObjects.id),
    folderId: text('folder_id').references(() => assetLibraryFolders.id),
    homeProjectId: text('home_project_id'),
    displayName: text('display_name').notNull(),
    description: text('description'),
    status: text('status').$type<AssetLibraryItemStatus>().notNull().default('active'),
    sourceType: text('source_type').$type<AssetLibrarySourceType>().notNull(),
    sourceProjectId: text('source_project_id'),
    sourceProjectName: text('source_project_name'),
    sourceRef: jsonb('source_ref').$type<Record<string, unknown>>().notNull().default({}),
    favoritedAt: timestamp('favorited_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    usageCount: integer('usage_count').notNull().default(0),
    addedByUserId: text('added_by_user_id').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index('asset_library_items_account_created_idx').on(table.accountId, table.createdAt),
    index('asset_library_items_account_folder_idx').on(table.accountId, table.folderId),
    index('asset_library_items_account_home_project_idx').on(table.accountId, table.homeProjectId),
    index('asset_library_items_account_recent_idx').on(table.accountId, table.status, table.updatedAt),
    index('asset_library_items_account_used_idx').on(table.accountId, table.status, table.lastUsedAt),
    index('asset_library_items_account_source_project_idx').on(table.accountId, table.sourceProjectId),
    index('asset_library_items_account_source_type_idx').on(table.accountId, table.sourceType),
    index('asset_library_items_media_object_idx').on(table.mediaObjectId),
  ],
)

export const assetLibraryItemTags = pgTable(
  'asset_library_item_tags',
  {
    assetItemId: text('asset_item_id')
      .notNull()
      .references(() => assetLibraryItems.id),
    tagId: text('tag_id')
      .notNull()
      .references(() => assetTags.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.assetItemId, table.tagId] }),
    index('asset_library_item_tags_tag_idx').on(table.tagId),
  ],
)

export const projectWorkflows = pgTable(
  'project_workflows',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.workflowId] }),
    uniqueIndex('project_workflows_workflow_uidx').on(table.workflowId),
    index('project_workflows_project_sort_idx').on(table.projectId, table.sortOrder),
  ],
)

export const workflowRuns = pgTable(
  'workflow_runs',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    workflowVersion: integer('workflow_version').notNull(),
    runMode: text('run_mode').$type<WorkflowRunMode>().notNull(),
    selectedNodeId: text('selected_node_id').notNull(),
    scopeGroupNodeId: text('scope_group_node_id'),
    status: text('status').$type<WorkflowRunStatus>().notNull(),
    error: text('error'),
    errorCode: text('error_code'),
    errorMessageKey: text('error_message_key'),
    errorParams: jsonb('error_params').$type<Record<string, string | number | boolean>>(),
    errorDebugMessage: text('error_debug_message'),
    nextReconcileAt: timestamp('next_reconcile_at', { withTimezone: true }),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    leasedBy: text('leased_by'),
    leaseToken: text('lease_token'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index('workflow_runs_claim_idx').on(table.status, table.nextReconcileAt, table.leaseUntil, table.updatedAt),
    index('workflow_runs_account_created_idx').on(table.accountId, table.createdAt),
    index('workflow_runs_workflow_created_idx').on(table.workflowId, table.createdAt),
  ],
)

export const workflowRunNodes = pgTable(
  'workflow_run_nodes',
  {
    workflowRunId: text('workflow_run_id')
      .notNull()
      .references(() => workflowRuns.id),
    nodeId: text('node_id').notNull(),
    type: text('type').$type<WorkflowNodeType>().notNull(),
    positionX: numeric('position_x', { precision: 14, scale: 3 }).notNull(),
    positionY: numeric('position_y', { precision: 14, scale: 3 }).notNull(),
    parentId: text('parent_id'),
    extent: text('extent').$type<'parent'>(),
    width: numeric('width', { precision: 14, scale: 3 }),
    height: numeric('height', { precision: 14, scale: 3 }),
    data: jsonb('data').$type<WorkflowNodeData>().notNull(),
    sortOrder: integer('sort_order').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workflowRunId, table.nodeId] }),
    index('workflow_run_nodes_run_sort_idx').on(table.workflowRunId, table.sortOrder),
    index('workflow_run_nodes_run_parent_idx').on(table.workflowRunId, table.parentId),
  ],
)

export const workflowRunEdges = pgTable(
  'workflow_run_edges',
  {
    workflowRunId: text('workflow_run_id')
      .notNull()
      .references(() => workflowRuns.id),
    edgeId: text('edge_id').notNull(),
    type: text('type').notNull().default('media'),
    sourceNodeId: text('source_node_id').notNull(),
    targetNodeId: text('target_node_id').notNull(),
    sourceHandle: text('source_handle'),
    targetHandle: text('target_handle'),
    data: jsonb('data').$type<WorkflowEdgeData>().notNull(),
    sortOrder: integer('sort_order').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workflowRunId, table.edgeId] }),
    index('workflow_run_edges_run_sort_idx').on(table.workflowRunId, table.sortOrder),
    index('workflow_run_edges_run_source_idx').on(table.workflowRunId, table.sourceNodeId),
    index('workflow_run_edges_run_target_idx').on(table.workflowRunId, table.targetNodeId),
  ],
)

export const workflowRunNodeStates = pgTable(
  'workflow_run_node_states',
  {
    workflowRunId: text('workflow_run_id')
      .notNull()
      .references(() => workflowRuns.id),
    nodeId: text('node_id').notNull(),
    status: text('status').$type<WorkflowRunNodeState['status']>().notNull(),
    taskId: text('task_id').references(() => tasks.id),
    output: jsonb('output').$type<NodeExecutionOutput>(),
    error: text('error'),
    errorCode: text('error_code'),
    errorMessageKey: text('error_message_key'),
    errorParams: jsonb('error_params').$type<Record<string, string | number | boolean>>(),
    errorDebugMessage: text('error_debug_message'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workflowRunId, table.nodeId] }),
    index('workflow_run_node_states_run_status_idx').on(table.workflowRunId, table.status),
    index('workflow_run_node_states_task_idx').on(table.taskId),
  ],
)

export const workflowRunNodeDependencies = pgTable(
  'workflow_run_node_dependencies',
  {
    workflowRunId: text('workflow_run_id')
      .notNull()
      .references(() => workflowRuns.id),
    nodeId: text('node_id').notNull(),
    dependsOnNodeId: text('depends_on_node_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workflowRunId, table.nodeId, table.dependsOnNodeId] }),
    index('workflow_run_node_dependencies_node_idx').on(table.workflowRunId, table.nodeId),
    index('workflow_run_node_dependencies_predecessor_idx').on(table.workflowRunId, table.dependsOnNodeId),
  ],
)

export const workflowRunNodeTasks = pgTable(
  'workflow_run_node_tasks',
  {
    id: text('id').primaryKey(),
    workflowRunId: text('workflow_run_id')
      .notNull()
      .references(() => workflowRuns.id),
    nodeId: text('node_id').notNull(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('workflow_run_node_tasks_run_node_uidx').on(table.workflowRunId, table.nodeId),
    index('workflow_run_node_tasks_task_idx').on(table.taskId),
  ],
)

export const workflowRunEvents = pgTable(
  'workflow_run_events',
  {
    id: text('id').primaryKey(),
    workflowRunId: text('workflow_run_id')
      .notNull()
      .references(() => workflowRuns.id),
    nodeId: text('node_id'),
    eventType: text('event_type').notNull(),
    message: text('message'),
    payload: jsonb('payload').$type<Record<string, unknown> & { connection?: WorkflowMediaLinkConnection; mediaView?: NodeMediaViewState }>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('workflow_run_events_run_idx').on(table.workflowRunId)],
)

export const workflowYjsUpdates = pgTable(
  'workflow_yjs_updates',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id),
    updateBin: bytea('update_bin').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('workflow_yjs_updates_workflow_created_idx').on(table.workflowId, table.createdAt)],
)

export const workflowYjsSnapshots = pgTable(
  'workflow_yjs_snapshots',
  {
    workflowId: text('workflow_id')
      .primaryKey()
      .references(() => workflows.id),
    stateVector: bytea('state_vector').notNull(),
    snapshotBin: bytea('snapshot_bin').notNull(),
    version: integer('version').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('workflow_yjs_snapshots_updated_idx').on(table.updatedAt)],
)
