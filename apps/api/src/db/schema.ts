import type { User } from '@mina/contracts/modules/accounts'
import type {
  NodeMediaViewState,
  WorkflowCanvasEdge,
  WorkflowCanvasNode,
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
import { index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export type MediaObjectStatus = 'uploading' | 'ready' | 'failed' | 'deleted'
export type MediaObjectOrigin = 'user_upload' | 'task_output' | 'external_import' | 'system_generated'
export type MediaObjectPurpose = 'task_input' | 'task_output' | 'workflow_slot' | 'temporary' | 'preview'
export type MediaObjectRetention = 'temporary' | 'task_scoped' | 'project_scoped' | 'library'

const timestamps = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    displayName: text('display_name'),
    role: text('role').$type<User['role']>().notNull().default('user'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [uniqueIndex('users_email_uidx').on(table.email)],
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
    errorMessage: text('error_message'),
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
    nodes: jsonb('nodes').$type<WorkflowCanvasNode[]>().notNull(),
    edges: jsonb('edges').$type<WorkflowCanvasEdge[]>().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [index('workflows_account_updated_idx').on(table.accountId, table.updatedAt)],
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
    snapshotNodes: jsonb('snapshot_nodes').$type<WorkflowCanvasNode[]>().notNull(),
    snapshotEdges: jsonb('snapshot_edges').$type<WorkflowCanvasEdge[]>().notNull(),
    nodeStates: jsonb('node_states').$type<Record<string, WorkflowRunNodeState>>().notNull(),
    status: text('status').$type<WorkflowRunStatus>().notNull(),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index('workflow_runs_status_updated_idx').on(table.status, table.updatedAt),
    index('workflow_runs_account_created_idx').on(table.accountId, table.createdAt),
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
