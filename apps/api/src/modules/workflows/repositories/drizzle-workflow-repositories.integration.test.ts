import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import type { NodeExecutionOutput, Task } from '@mina/contracts/modules/tasks'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import type { MinaDbClient } from '../../../db/client'
import * as schema from '../../../db/schema'
import { DrizzleTaskRepository } from '../../tasks/tasks.drizzle-repository'
import { DrizzleWorkflowDefinitionRepository } from './drizzle-workflow-definition.repository'
import { DrizzleWorkflowNodeTaskRepository } from './drizzle-workflow-node-task.repository'
import { DrizzleWorkflowRunNodeStateRepository } from './drizzle-workflow-run-node-state.repository'
import { DrizzleWorkflowRunRepository } from './drizzle-workflow-run.repository'

const databaseUrl = process.env.MINA_POSTGRES_TEST_DATABASE_URL

type SqlClient = ReturnType<typeof postgres>

const quoteIdentifier = (value: string): string => `"${value.replaceAll('"', '""')}"`

const createScopedSqlClient = async (schemaName: string): Promise<SqlClient> => {
  const sql = postgres(databaseUrl!, { max: 1, prepare: false })
  await sql.unsafe(`SET search_path TO ${quoteIdentifier(schemaName)}`)
  return sql
}

const createDb = (sql: SqlClient): MinaDbClient => drizzle(sql, { schema }) as MinaDbClient

const createTestSchema = async (sql: SqlClient): Promise<void> => {
  const statements = [
    `CREATE TABLE "users" (
      "id" text PRIMARY KEY NOT NULL,
      "email" text NOT NULL,
      "display_name" text,
      "role" text DEFAULT 'user' NOT NULL,
      "deleted_at" timestamp with time zone,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    )`,
    `CREATE TABLE "accounts" (
      "id" text PRIMARY KEY NOT NULL,
      "owner_user_id" text NOT NULL REFERENCES "users"("id"),
      "name" text NOT NULL,
      "storage_root_prefix" text NOT NULL,
      "deleted_at" timestamp with time zone,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    )`,
    `CREATE TABLE "tasks" (
      "id" text PRIMARY KEY NOT NULL,
      "idempotency_key" text,
      "account_id" text NOT NULL REFERENCES "accounts"("id"),
      "kind" text NOT NULL,
      "mode" text NOT NULL,
      "provider" text NOT NULL,
      "model" text NOT NULL,
      "status" text NOT NULL,
      "config" jsonb NOT NULL,
      "external_task_id" text,
      "provider_status" text,
      "provider_metadata" jsonb,
      "estimated_cost" numeric(16, 6) NOT NULL,
      "actual_cost" numeric(16, 6),
      "usage_metric" text NOT NULL,
      "estimated_usage_amount" numeric(16, 6) NOT NULL,
      "actual_usage_amount" numeric(16, 6),
      "output" jsonb,
      "error_code" text,
      "error_message" text,
      "retry_count" integer DEFAULT 0 NOT NULL,
      "next_retry_at" timestamp with time zone,
      "submitted_at" timestamp with time zone,
      "last_polled_at" timestamp with time zone,
      "expires_at" timestamp with time zone,
      "started_at" timestamp with time zone,
      "completed_at" timestamp with time zone,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    )`,
    `CREATE TABLE "task_resources" (
      "id" text PRIMARY KEY NOT NULL,
      "account_id" text NOT NULL REFERENCES "accounts"("id"),
      "task_id" text NOT NULL REFERENCES "tasks"("id"),
      "direction" text NOT NULL,
      "kind" text NOT NULL,
      "url" text NOT NULL,
      "role" text,
      "output_index" integer,
      "media_object_id" text,
      "slot" text,
      "slot_item_id" text,
      "slot_order" integer,
      "source" jsonb,
      "metadata" jsonb,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    )`,
    `CREATE TABLE "workflows" (
      "id" text PRIMARY KEY NOT NULL,
      "account_id" text NOT NULL REFERENCES "accounts"("id"),
      "name" text NOT NULL,
      "version" integer NOT NULL,
      "deleted_at" timestamp with time zone,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    )`,
    `CREATE TABLE "workflow_nodes" (
      "workflow_id" text NOT NULL REFERENCES "workflows"("id"),
      "node_id" text NOT NULL,
      "type" text NOT NULL,
      "position_x" numeric(14, 3) NOT NULL,
      "position_y" numeric(14, 3) NOT NULL,
      "parent_id" text,
      "extent" text,
      "width" numeric(14, 3),
      "height" numeric(14, 3),
      "data" jsonb NOT NULL,
      "sort_order" integer NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
      PRIMARY KEY ("workflow_id", "node_id")
    )`,
    `CREATE TABLE "workflow_edges" (
      "workflow_id" text NOT NULL REFERENCES "workflows"("id"),
      "edge_id" text NOT NULL,
      "type" text DEFAULT 'media' NOT NULL,
      "source_node_id" text NOT NULL,
      "target_node_id" text NOT NULL,
      "source_handle" text,
      "target_handle" text,
      "data" jsonb NOT NULL,
      "sort_order" integer NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
      PRIMARY KEY ("workflow_id", "edge_id")
    )`,
    `CREATE TABLE "workflow_runs" (
      "id" text PRIMARY KEY NOT NULL,
      "workflow_id" text NOT NULL REFERENCES "workflows"("id"),
      "account_id" text NOT NULL REFERENCES "accounts"("id"),
      "workflow_version" integer NOT NULL,
      "run_mode" text NOT NULL,
      "selected_node_id" text NOT NULL,
      "scope_group_node_id" text,
      "status" text NOT NULL,
      "error" text,
      "next_reconcile_at" timestamp with time zone,
      "lease_until" timestamp with time zone,
      "leased_by" text,
      "lease_token" text,
      "started_at" timestamp with time zone,
      "completed_at" timestamp with time zone,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    )`,
    `CREATE TABLE "workflow_run_nodes" (
      "workflow_run_id" text NOT NULL REFERENCES "workflow_runs"("id"),
      "node_id" text NOT NULL,
      "type" text NOT NULL,
      "position_x" numeric(14, 3) NOT NULL,
      "position_y" numeric(14, 3) NOT NULL,
      "parent_id" text,
      "extent" text,
      "width" numeric(14, 3),
      "height" numeric(14, 3),
      "data" jsonb NOT NULL,
      "sort_order" integer NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      PRIMARY KEY ("workflow_run_id", "node_id")
    )`,
    `CREATE TABLE "workflow_run_edges" (
      "workflow_run_id" text NOT NULL REFERENCES "workflow_runs"("id"),
      "edge_id" text NOT NULL,
      "type" text DEFAULT 'media' NOT NULL,
      "source_node_id" text NOT NULL,
      "target_node_id" text NOT NULL,
      "source_handle" text,
      "target_handle" text,
      "data" jsonb NOT NULL,
      "sort_order" integer NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      PRIMARY KEY ("workflow_run_id", "edge_id")
    )`,
    `CREATE TABLE "workflow_run_node_states" (
      "workflow_run_id" text NOT NULL REFERENCES "workflow_runs"("id"),
      "node_id" text NOT NULL,
      "status" text NOT NULL,
      "task_id" text REFERENCES "tasks"("id"),
      "output" jsonb,
      "error" text,
      "started_at" timestamp with time zone,
      "completed_at" timestamp with time zone,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
      PRIMARY KEY ("workflow_run_id", "node_id")
    )`,
    `CREATE TABLE "workflow_run_node_dependencies" (
      "workflow_run_id" text NOT NULL REFERENCES "workflow_runs"("id"),
      "node_id" text NOT NULL,
      "depends_on_node_id" text NOT NULL,
      PRIMARY KEY ("workflow_run_id", "node_id", "depends_on_node_id")
    )`,
    `CREATE TABLE "workflow_run_node_tasks" (
      "id" text PRIMARY KEY NOT NULL,
      "workflow_run_id" text NOT NULL REFERENCES "workflow_runs"("id"),
      "node_id" text NOT NULL,
      "task_id" text NOT NULL REFERENCES "tasks"("id"),
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    )`,
    `CREATE UNIQUE INDEX "tasks_idempotency_key_uidx" ON "tasks" ("idempotency_key")`,
    `CREATE INDEX "workflow_runs_claim_idx" ON "workflow_runs" ("status", "next_reconcile_at", "lease_until", "updated_at")`,
    `CREATE INDEX "workflow_run_node_states_run_status_idx" ON "workflow_run_node_states" ("workflow_run_id", "status")`,
    `CREATE INDEX "workflow_run_node_states_task_idx" ON "workflow_run_node_states" ("task_id")`,
    `CREATE INDEX "workflow_run_node_dependencies_node_idx" ON "workflow_run_node_dependencies" ("workflow_run_id", "node_id")`,
    `CREATE INDEX "workflow_run_node_dependencies_predecessor_idx" ON "workflow_run_node_dependencies" ("workflow_run_id", "depends_on_node_id")`,
    `CREATE UNIQUE INDEX "workflow_run_node_tasks_run_node_uidx" ON "workflow_run_node_tasks" ("workflow_run_id", "node_id")`,
    `CREATE INDEX "workflow_run_node_tasks_task_idx" ON "workflow_run_node_tasks" ("task_id")`,
  ]

  for (const statement of statements) {
    await sql.unsafe(statement)
  }
}

const seedAccount = async (sql: SqlClient): Promise<void> => {
  await sql`
    INSERT INTO "users" ("id", "email", "display_name", "role")
    VALUES ('user_drizzle_workflow_test', 'drizzle-workflow-test@mina.local', 'Workflow Repo Test', 'admin')
  `
  await sql`
    INSERT INTO "accounts" ("id", "owner_user_id", "name", "storage_root_prefix")
    VALUES ('account_drizzle_workflow_test', 'user_drizzle_workflow_test', 'Workflow Repo Test', 'test/workflow-repo')
  `
}

const resetRows = async (sql: SqlClient): Promise<void> => {
  await sql.unsafe(`TRUNCATE TABLE
    "workflow_run_node_tasks",
    "workflow_run_node_dependencies",
    "workflow_run_node_states",
    "workflow_run_edges",
    "workflow_run_nodes",
    "workflow_runs",
    "workflow_edges",
    "workflow_nodes",
    "workflows",
    "task_resources",
    "tasks",
    "accounts",
    "users"
    RESTART IDENTITY CASCADE`)
}

const imageNode = (id: string): WorkflowCanvasNode => ({
  id,
  type: 'image_generation',
  position: { x: 0, y: 0 },
  data: {
    nodeType: 'image_generation',
    title: id,
    config: {},
  },
})

const taskInput = (id: string, idempotencyKey?: string): Task => {
  const timestamp = new Date().toISOString()
  return {
    id,
    ...(idempotencyKey ? { idempotencyKey } : {}),
    accountId: 'account_drizzle_workflow_test',
    kind: 'image_generation',
    mode: 'sync',
    provider: 'dev',
    model: 'dev-image',
    status: 'queued',
    config: {
      kind: 'image_generation',
      provider: 'dev',
      model: 'dev-image',
      prompt: 'generate',
      params: {},
      media: {
        inputImages: [],
        referenceImages: [],
        referenceAudios: [],
        referenceVideos: [],
      },
    },
    cost: {
      estimatedCost: 0,
      usage: { metric: 'image', amount: 1 },
    },
    retryCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

const output: NodeExecutionOutput = {
  resources: [
    {
      id: 'resource_a',
      kind: 'image',
      role: 'generated_image',
      index: 0,
      url: 'https://cdn.test/a.png',
    },
  ],
  variables: {
    imageUrls: ['https://cdn.test/a.png'],
  },
}

if (!databaseUrl) {
  test.skip('Drizzle workflow repository concurrency tests require MINA_POSTGRES_TEST_DATABASE_URL', () => {})
} else {
  describe('Drizzle workflow repositories concurrency', () => {
    const schemaName = `mina_workflow_repo_${process.pid}_${Date.now()}`

    let sql: SqlClient
    let db: MinaDbClient
    let definitions: DrizzleWorkflowDefinitionRepository
    let runs: DrizzleWorkflowRunRepository
    let nodeStates: DrizzleWorkflowRunNodeStateRepository
    let tasks: DrizzleTaskRepository

    const createRun = async (input: {
      dependencies?: Array<{ dependsOnNodeId: string; nodeId: string }>
      executableNodeIds?: string[]
      nodes?: WorkflowCanvasNode[]
      runId: string
    }) => {
      const nodes = input.nodes ?? [imageNode('node_a')]
      const workflowId = `workflow_${input.runId}`
      const timestamp = new Date().toISOString()
      await definitions.create({
        id: workflowId,
        accountId: 'account_drizzle_workflow_test',
        name: input.runId,
        version: 1,
        nodes,
        edges: [],
        timestamp,
      })
      return runs.createRunWithSnapshot({
        dependencies: (input.dependencies ?? []).map((dependency) => ({
          ...dependency,
          workflowRunId: input.runId,
        })),
        executableNodeIds: input.executableNodeIds ?? [nodes[0]!.id],
        run: {
          id: input.runId,
          workflowId,
          accountId: 'account_drizzle_workflow_test',
          workflowVersion: 1,
          runMode: 'isolated_node',
          selectedNodeId: nodes[0]!.id,
          status: 'running',
          createdAt: timestamp,
          updatedAt: timestamp,
          startedAt: timestamp,
        },
        snapshotEdges: [],
        snapshotNodes: nodes,
      })
    }

    const createWorkerRunRepository = async (): Promise<{
      repository: DrizzleWorkflowRunRepository
      sql: SqlClient
    }> => {
      const workerSql = await createScopedSqlClient(schemaName)
      return {
        repository: new DrizzleWorkflowRunRepository(createDb(workerSql)),
        sql: workerSql,
      }
    }

    beforeAll(async () => {
      sql = await createScopedSqlClient(schemaName)
      await sql.unsafe(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`)
      await sql.unsafe(`SET search_path TO ${quoteIdentifier(schemaName)}`)
      await createTestSchema(sql)
      db = createDb(sql)
      definitions = new DrizzleWorkflowDefinitionRepository(db)
      runs = new DrizzleWorkflowRunRepository(db)
      nodeStates = new DrizzleWorkflowRunNodeStateRepository(db)
      tasks = new DrizzleTaskRepository(db)
    })

    beforeEach(async () => {
      await resetRows(sql)
      await seedAccount(sql)
    })

    afterAll(async () => {
      if (sql) {
        await sql.unsafe(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`)
        await sql.end()
      }
    })

    test('two concurrent claimRunningRuns calls do not claim the same run', async () => {
      await createRun({ runId: 'run_claim_once' })
      const workerA = await createWorkerRunRepository()
      const workerB = await createWorkerRunRepository()

      try {
        const [claimedA, claimedB] = await Promise.all([
          workerA.repository.claimRunningRuns({ instanceId: 'worker_a', leaseSeconds: 30, limit: 1 }),
          workerB.repository.claimRunningRuns({ instanceId: 'worker_b', leaseSeconds: 30, limit: 1 }),
        ])
        const ids = [...claimedA, ...claimedB].map((run) => run.id)

        expect(ids).toContain('run_claim_once')
        expect(ids).toHaveLength(1)
      } finally {
        await workerA.sql.end()
        await workerB.sql.end()
      }
    })

    test('non-expired leases are not reclaimed and expired leases are reclaimed', async () => {
      await createRun({ runId: 'run_lease' })
      const firstClaim = await runs.claimRunningRuns({ instanceId: 'worker_a', leaseSeconds: 30, limit: 1 })

      expect(firstClaim.map((run) => run.id)).toEqual(['run_lease'])
      await expect(runs.claimRunningRuns({ instanceId: 'worker_b', leaseSeconds: 30, limit: 1 })).resolves.toEqual([])

      await sql`UPDATE "workflow_runs" SET "lease_until" = now() - interval '1 second' WHERE "id" = 'run_lease'`
      const reclaimed = await runs.claimRunningRuns({ instanceId: 'worker_b', leaseSeconds: 30, limit: 1 })

      expect(reclaimed.map((run) => run.id)).toEqual(['run_lease'])
      expect(reclaimed[0]?.leaseToken).not.toBe(firstClaim[0]?.leaseToken)
    })

    test('ready-node selection waits for predecessor success', async () => {
      await createRun({
        runId: 'run_ready_nodes',
        nodes: [imageNode('node_a'), imageNode('node_b')],
        executableNodeIds: ['node_a', 'node_b'],
        dependencies: [{ nodeId: 'node_b', dependsOnNodeId: 'node_a' }],
      })

      expect((await nodeStates.listRunnableNodes({ workflowRunId: 'run_ready_nodes', limit: 10 })).map((item) => item.node.id)).toEqual([
        'node_a',
      ])

      const task = (await tasks.create(taskInput('task_node_a'), [])).task
      expect(
        await nodeStates.markNodeRunning({
          workflowRunId: 'run_ready_nodes',
          nodeId: 'node_a',
          taskId: task.id,
          startedAt: new Date().toISOString(),
        }),
      ).toBe(true)
      expect(
        await nodeStates.markNodeSucceeded({
          workflowRunId: 'run_ready_nodes',
          nodeId: 'node_a',
          taskId: task.id,
          output,
          completedAt: new Date().toISOString(),
        }),
      ).toBe(true)

      expect((await nodeStates.listRunnableNodes({ workflowRunId: 'run_ready_nodes', limit: 10 })).map((item) => item.node.id)).toEqual([
        'node_b',
      ])
    })

    test('conditional node running update fails once a node is no longer pending', async () => {
      await createRun({ runId: 'run_conditional_node' })
      const task = (await tasks.create(taskInput('task_conditional_node'), [])).task

      expect(
        await nodeStates.markNodeRunning({
          workflowRunId: 'run_conditional_node',
          nodeId: 'node_a',
          taskId: task.id,
          startedAt: new Date().toISOString(),
        }),
      ).toBe(true)
      expect(
        await nodeStates.markNodeRunning({
          workflowRunId: 'run_conditional_node',
          nodeId: 'node_a',
          taskId: 'task_not_inserted',
          startedAt: new Date().toISOString(),
        }),
      ).toBe(false)
    })

    test('duplicate task idempotency keys return the existing task', async () => {
      const key = 'workflow_run:run_task_idempotency:node:node_a'
      const workerASql = await createScopedSqlClient(schemaName)
      const workerBSql = await createScopedSqlClient(schemaName)

      try {
        const workerA = new DrizzleTaskRepository(createDb(workerASql))
        const workerB = new DrizzleTaskRepository(createDb(workerBSql))
        const [first, second] = await Promise.all([
          workerA.create(taskInput('task_idempotency_a', key), []),
          workerB.create(taskInput('task_idempotency_b', key), []),
        ])
        const rows = await sql<{ count: number }[]>`
          SELECT count(*)::int AS count FROM "tasks" WHERE "idempotency_key" = ${key}
        `

        expect(first.task.id).toBe(second.task.id)
        expect(Number(rows[0]?.count)).toBe(1)
      } finally {
        await workerASql.end()
        await workerBSql.end()
      }
    })

    test('concurrent node starts create one task and one node-task link', async () => {
      await createRun({ runId: 'run_concurrent_node_start' })
      const key = 'workflow_run:run_concurrent_node_start:node:node_a'

      const startNode = async (suffix: string) => {
        const scopedSql = await createScopedSqlClient(schemaName)
        const scopedDb = createDb(scopedSql)
        try {
          const scopedStates = new DrizzleWorkflowRunNodeStateRepository(scopedDb)
          const scopedTasks = new DrizzleTaskRepository(scopedDb)
          const scopedLinks = new DrizzleWorkflowNodeTaskRepository(scopedDb)
          const canStart = await scopedStates.tryMarkNodeStarting({
            workflowRunId: 'run_concurrent_node_start',
            nodeId: 'node_a',
          })
          if (!canStart) {
            return false
          }
          const task = (await scopedTasks.create(taskInput(`task_concurrent_${suffix}`, key), [])).task
          await scopedLinks.linkNodeTask({
            workflowRunId: 'run_concurrent_node_start',
            nodeId: 'node_a',
            taskId: task.id,
          })
          return scopedStates.markNodeRunning({
            workflowRunId: 'run_concurrent_node_start',
            nodeId: 'node_a',
            taskId: task.id,
            startedAt: new Date().toISOString(),
          })
        } finally {
          await scopedSql.end()
        }
      }

      const results = await Promise.all([startNode('a'), startNode('b')])
      const taskRows = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM "tasks" WHERE "idempotency_key" = ${key}
      `
      const linkRows = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM "workflow_run_node_tasks"
        WHERE "workflow_run_id" = 'run_concurrent_node_start' AND "node_id" = 'node_a'
      `
      const run = await runs.findRunById('run_concurrent_node_start')

      expect(results.filter(Boolean)).toHaveLength(1)
      expect(Number(taskRows[0]?.count)).toBe(1)
      expect(Number(linkRows[0]?.count)).toBe(1)
      expect(run?.nodeStates.node_a?.status).toBe('running')
    })

    test('updating one node state does not overwrite another node state', async () => {
      await createRun({
        runId: 'run_row_level_states',
        nodes: [imageNode('node_a'), imageNode('node_b')],
        executableNodeIds: ['node_a', 'node_b'],
      })
      const taskA = (await tasks.create(taskInput('task_row_level_a'), [])).task
      const taskB = (await tasks.create(taskInput('task_row_level_b'), [])).task

      expect(
        await nodeStates.markNodeRunning({
          workflowRunId: 'run_row_level_states',
          nodeId: 'node_a',
          taskId: taskA.id,
          startedAt: new Date().toISOString(),
        }),
      ).toBe(true)
      expect(
        await nodeStates.markNodeRunning({
          workflowRunId: 'run_row_level_states',
          nodeId: 'node_b',
          taskId: taskB.id,
          startedAt: new Date().toISOString(),
        }),
      ).toBe(true)
      expect(
        await nodeStates.markNodeSucceeded({
          workflowRunId: 'run_row_level_states',
          nodeId: 'node_a',
          taskId: taskA.id,
          output,
          completedAt: new Date().toISOString(),
        }),
      ).toBe(true)

      const run = await runs.findRunById('run_row_level_states')
      expect(run?.nodeStates.node_a?.status).toBe('succeeded')
      expect(run?.nodeStates.node_b?.status).toBe('running')
      expect(run?.nodeStates.node_b?.taskId).toBe(taskB.id)
    })
  })
}
