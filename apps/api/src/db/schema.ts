import type {
  MediaSlotConnection,
  NodeExecutionOutput,
  NodeMediaViewState,
  PricingRule,
  ResourceKind,
  ResourceRole,
  TaskConfig,
  TaskKind,
  TaskMode,
  TaskStatus,
  WorkflowCanvasEdge,
  WorkflowCanvasNode,
  WorkflowRunMode,
  WorkflowRunNodeState,
  WorkflowRunStatus,
} from '@mina/contracts'
import { index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

const timestamps = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const pricingRules = pgTable(
  'pricing_rules',
  {
    id: text('id').primaryKey(),
    taskKind: text('task_kind').$type<PricingRule['taskKind']>().notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    resolution: text('resolution'),
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
      table.resolution,
      table.billingMetric,
    ),
  ],
)

export const tasks = pgTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    kind: text('kind').$type<TaskKind>().notNull(),
    mode: text('mode').$type<TaskMode>().notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    status: text('status').$type<TaskStatus>().notNull(),
    config: jsonb('config').$type<TaskConfig>().notNull(),
    externalTaskId: text('external_task_id'),
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
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index('tasks_status_retry_idx').on(table.status, table.nextRetryAt),
    index('tasks_async_poll_idx').on(table.status, table.mode, table.externalTaskId),
    index('tasks_account_created_idx').on(table.accountId, table.createdAt),
  ],
)

export const taskResources = pgTable(
  'task_resources',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id),
    direction: text('direction').$type<'input' | 'output'>().notNull(),
    kind: text('kind').$type<ResourceKind>().notNull(),
    url: text('url').notNull(),
    role: text('role').$type<ResourceRole>(),
    outputIndex: integer('output_index'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('task_resources_task_idx').on(table.taskId)],
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
    accountId: text('account_id').notNull(),
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
    accountId: text('account_id').notNull(),
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
    payload: jsonb('payload').$type<Record<string, unknown> & { connection?: MediaSlotConnection; mediaView?: NodeMediaViewState }>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('workflow_run_events_run_idx').on(table.workflowRunId)],
)
