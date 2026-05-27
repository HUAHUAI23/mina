import type { WorkflowSummary } from '@mina/contracts/modules/workflows'
import { and, asc, desc, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm'

import type { MinaDbClient, MinaDbTransaction } from '../../db/client'
import { projectWorkflows, projects, workflows } from '../../db/schema'
import { toIso, workflowSummaryDto } from '../workflows/repositories/workflow-mappers'
import { projectDto, projectWithWorkflowsDto, projectWorkflowDto } from './project-mappers'
import type { CreateProjectRecordInput, ProjectRepository } from './projects.repository'

type ProjectRow = typeof projects.$inferSelect
type ProjectWorkflowRow = typeof projectWorkflows.$inferSelect
type WorkflowRow = typeof workflows.$inferSelect
type QueryDb = MinaDbClient | MinaDbTransaction

const projectFromRow = (row: ProjectRow) =>
  projectDto({
    accountId: row.accountId,
    createdAt: toIso(row.createdAt),
    id: row.id,
    name: row.name,
    updatedAt: toIso(row.updatedAt),
  })

const projectWorkflowFromRow = (row: ProjectWorkflowRow) =>
  projectWorkflowDto({
    createdAt: toIso(row.createdAt),
    projectId: row.projectId,
    sortOrder: row.sortOrder,
    updatedAt: toIso(row.updatedAt),
    workflowId: row.workflowId,
  })

const workflowFromRow = (row: WorkflowRow): WorkflowSummary =>
  workflowSummaryDto({
    accountId: row.accountId,
    createdAt: toIso(row.createdAt),
    id: row.id,
    name: row.name,
    updatedAt: toIso(row.updatedAt),
    version: row.version,
  })

const uniqueWorkflowIds = (workflowIds: string[]): string[] => Array.from(new Set(workflowIds))

export class DrizzleProjectRepository implements ProjectRepository {
  constructor(private readonly db: MinaDbClient) {}

  async addWorkflow(input: {
    accountId: string
    projectId: string
    timestamp: string
    workflowId: string
  }) {
    const result = await this.db.transaction(async (tx) => {
      const project = await this.findProjectRow(tx, input.accountId, input.projectId)
      const workflow = await this.findWorkflowRow(tx, input.accountId, input.workflowId)
      if (!project || !workflow) {
        return undefined
      }

      await tx.insert(projectWorkflows).values({
        createdAt: new Date(input.timestamp),
        projectId: input.projectId,
        sortOrder: await this.nextSortOrder(tx, input.projectId),
        updatedAt: new Date(input.timestamp),
        workflowId: input.workflowId,
      })
      await tx
        .update(projects)
        .set({ updatedAt: new Date(input.timestamp) })
        .where(and(eq(projects.id, input.projectId), eq(projects.accountId, input.accountId), isNull(projects.deletedAt)))
      return this.findByIdInTx(tx, input.accountId, input.projectId)
    })

    return result
  }

  async create(input: CreateProjectRecordInput & { workflowIds: string[] }) {
    const workflowIds = uniqueWorkflowIds(input.workflowIds)
    const result = await this.db.transaction(async (tx) => {
      const [projectRow] = await tx
        .insert(projects)
        .values({
          accountId: input.accountId,
          createdAt: new Date(input.timestamp),
          deletedAt: null,
          id: input.id,
          name: input.name,
          updatedAt: new Date(input.timestamp),
        })
        .returning()

      if (!projectRow) {
        throw new Error('Project was not persisted.')
      }

      if (workflowIds.length > 0) {
        await this.assertWorkflowsExist(tx, input.accountId, workflowIds)
        await tx.insert(projectWorkflows).values(
          workflowIds.map((workflowId, index) => ({
            createdAt: new Date(input.timestamp),
            projectId: input.id,
            sortOrder: index,
            updatedAt: new Date(input.timestamp),
            workflowId,
          })),
        )
      }

      const project = await this.findByIdInTx(tx, input.accountId, input.id)
      if (!project) {
        throw new Error('Project was not loaded after creation.')
      }
      return project
    })

    return result
  }

  async delete(input: { accountId: string; projectId: string; timestamp: string }): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(projects)
        .set({ deletedAt: new Date(input.timestamp), updatedAt: new Date(input.timestamp) })
        .where(and(eq(projects.id, input.projectId), eq(projects.accountId, input.accountId), isNull(projects.deletedAt)))
        .returning({ id: projects.id })

      if (!row) {
        return false
      }

      await tx.delete(projectWorkflows).where(eq(projectWorkflows.projectId, input.projectId))
      return true
    })
  }

  async findById(accountId: string, projectId: string) {
    return this.findByIdInTx(this.db, accountId, projectId)
  }

  async findWorkflowMembership(accountId: string, workflowId: string) {
    const [row] = await this.db
      .select({ membership: projectWorkflows })
      .from(projectWorkflows)
      .innerJoin(projects, eq(projects.id, projectWorkflows.projectId))
      .innerJoin(workflows, eq(workflows.id, projectWorkflows.workflowId))
      .where(
        and(
          eq(projectWorkflows.workflowId, workflowId),
          eq(projects.accountId, accountId),
          isNull(projects.deletedAt),
          isNull(workflows.deletedAt),
        ),
      )
      .limit(1)

    return row ? projectWorkflowFromRow(row.membership) : undefined
  }

  async listOverview(accountId: string) {
    const projectRows = await this.db
      .select()
      .from(projects)
      .where(and(eq(projects.accountId, accountId), isNull(projects.deletedAt)))
      .orderBy(desc(projects.updatedAt))
    const workflowRows = await this.db
      .select({
        membership: projectWorkflows,
        workflow: workflows,
      })
      .from(projectWorkflows)
      .innerJoin(projects, eq(projects.id, projectWorkflows.projectId))
      .innerJoin(workflows, eq(workflows.id, projectWorkflows.workflowId))
      .where(and(eq(projects.accountId, accountId), isNull(projects.deletedAt), isNull(workflows.deletedAt)))
      .orderBy(asc(projectWorkflows.sortOrder), desc(workflows.updatedAt))

    const workflowsByProject = new Map<string, WorkflowSummary[]>()
    for (const row of workflowRows) {
      const items = workflowsByProject.get(row.membership.projectId) ?? []
      items.push(workflowFromRow(row.workflow))
      workflowsByProject.set(row.membership.projectId, items)
    }

    const memberWorkflowIds = workflowRows.map((row) => row.workflow.id)
    const ungroupedRows =
      memberWorkflowIds.length > 0
        ? await this.db
            .select()
            .from(workflows)
            .where(
              and(
                eq(workflows.accountId, accountId),
                isNull(workflows.deletedAt),
                notInArray(workflows.id, memberWorkflowIds),
              ),
            )
            .orderBy(desc(workflows.updatedAt))
        : await this.db
            .select()
            .from(workflows)
            .where(and(eq(workflows.accountId, accountId), isNull(workflows.deletedAt)))
            .orderBy(desc(workflows.updatedAt))

    return {
      projects: projectRows.map((row) => projectWithWorkflowsDto(projectFromRow(row), workflowsByProject.get(row.id) ?? [])),
      ungroupedWorkflows: ungroupedRows.map(workflowFromRow),
    }
  }

  async removeWorkflow(input: { accountId: string; projectId: string; workflowId: string }): Promise<boolean> {
    const [row] = await this.db
      .delete(projectWorkflows)
      .where(
        and(
          eq(projectWorkflows.projectId, input.projectId),
          eq(projectWorkflows.workflowId, input.workflowId),
          sql`exists (
            select 1 from ${projects}
            where ${projects.id} = ${projectWorkflows.projectId}
              and ${projects.accountId} = ${input.accountId}
              and ${projects.deletedAt} is null
          )`,
        ),
      )
      .returning({ workflowId: projectWorkflows.workflowId })

    return row !== undefined
  }

  async update(input: { accountId: string; name: string; projectId: string; timestamp: string }) {
    const [row] = await this.db
      .update(projects)
      .set({ name: input.name, updatedAt: new Date(input.timestamp) })
      .where(and(eq(projects.id, input.projectId), eq(projects.accountId, input.accountId), isNull(projects.deletedAt)))
      .returning()

    return row ? this.findById(input.accountId, row.id) : undefined
  }

  private async assertWorkflowsExist(db: QueryDb, accountId: string, workflowIds: string[]): Promise<void> {
    const rows = await db
      .select({ id: workflows.id })
      .from(workflows)
      .where(and(eq(workflows.accountId, accountId), isNull(workflows.deletedAt), inArray(workflows.id, workflowIds)))

    if (rows.length !== workflowIds.length) {
      throw new Error('One or more workflows were not found.')
    }
  }

  private async findByIdInTx(db: QueryDb, accountId: string, projectId: string) {
    const projectRow = await this.findProjectRow(db, accountId, projectId)
    if (!projectRow) {
      return undefined
    }

    const workflowRows = await db
      .select({ workflow: workflows })
      .from(projectWorkflows)
      .innerJoin(workflows, eq(workflows.id, projectWorkflows.workflowId))
      .where(and(eq(projectWorkflows.projectId, projectId), isNull(workflows.deletedAt)))
      .orderBy(asc(projectWorkflows.sortOrder), desc(workflows.updatedAt))

    return projectWithWorkflowsDto(projectFromRow(projectRow), workflowRows.map((row) => workflowFromRow(row.workflow)))
  }

  private async findProjectRow(db: QueryDb, accountId: string, projectId: string): Promise<ProjectRow | undefined> {
    const [row] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.accountId, accountId), isNull(projects.deletedAt)))
      .limit(1)
    return row
  }

  private async findWorkflowRow(db: QueryDb, accountId: string, workflowId: string): Promise<WorkflowRow | undefined> {
    const [row] = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, workflowId), eq(workflows.accountId, accountId), isNull(workflows.deletedAt)))
      .limit(1)
    return row
  }

  private async nextSortOrder(db: QueryDb, projectId: string): Promise<number> {
    const [row] = await db
      .select({ value: sql<number>`coalesce(max(${projectWorkflows.sortOrder}), -1) + 1` })
      .from(projectWorkflows)
      .where(eq(projectWorkflows.projectId, projectId))
    return row?.value ?? 0
  }
}
