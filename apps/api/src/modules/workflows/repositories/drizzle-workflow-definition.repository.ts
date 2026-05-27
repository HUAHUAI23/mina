import type { WorkflowSummary } from '@mina/contracts/modules/workflows'
import { and, desc, eq, isNull } from 'drizzle-orm'

import type { MinaDbClient } from '../../../db/client'
import { workflows } from '../../../db/schema'
import { toIso, workflowSummaryDto } from './workflow-mappers'
import type {
  WorkflowDefinitionCreate,
  WorkflowDefinitionRepository,
} from './workflow-definition.repository'

type WorkflowRow = typeof workflows.$inferSelect

const summaryFromRow = (row: WorkflowRow): WorkflowSummary =>
  workflowSummaryDto({
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    version: row.version,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  })

export class DrizzleWorkflowDefinitionRepository implements WorkflowDefinitionRepository {
  constructor(private readonly db: MinaDbClient) {}

  async create(input: WorkflowDefinitionCreate): Promise<WorkflowSummary> {
    const [row] = await this.db
      .insert(workflows)
      .values({
        id: input.id,
        accountId: input.accountId,
        name: input.name,
        version: input.version,
        deletedAt: null,
        createdAt: new Date(input.timestamp),
        updatedAt: new Date(input.timestamp),
      })
      .returning()
    if (!row) {
      throw new Error('Workflow was not persisted.')
    }
    return summaryFromRow(row)
  }

  async delete(id: string): Promise<boolean> {
    const [row] = await this.db
      .update(workflows)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(workflows.id, id), isNull(workflows.deletedAt)))
      .returning({ id: workflows.id })

    return row !== undefined
  }

  async findById(id: string): Promise<WorkflowSummary | undefined> {
    const [row] = await this.db
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, id), isNull(workflows.deletedAt)))
      .limit(1)
    return row ? summaryFromRow(row) : undefined
  }

  async list(accountId?: string): Promise<WorkflowSummary[]> {
    const rows = accountId
      ? await this.db
          .select()
          .from(workflows)
          .where(and(eq(workflows.accountId, accountId), isNull(workflows.deletedAt)))
          .orderBy(desc(workflows.updatedAt))
      : await this.db.select().from(workflows).where(isNull(workflows.deletedAt)).orderBy(desc(workflows.updatedAt))

    return rows.map(summaryFromRow)
  }

  async touch(id: string, timestamp: string, version: number): Promise<WorkflowSummary> {
    const [row] = await this.db
      .update(workflows)
      .set({
        version,
        updatedAt: new Date(timestamp),
      })
      .where(and(eq(workflows.id, id), isNull(workflows.deletedAt)))
      .returning()
    if (!row) {
      throw new Error('Workflow not found.')
    }
    return summaryFromRow(row)
  }

  async updateName(id: string, name: string, timestamp: string): Promise<WorkflowSummary | undefined> {
    const [row] = await this.db
      .update(workflows)
      .set({
        name,
        updatedAt: new Date(timestamp),
      })
      .where(and(eq(workflows.id, id), isNull(workflows.deletedAt)))
      .returning()
    return row ? summaryFromRow(row) : undefined
  }
}
