import { eq } from 'drizzle-orm'

import type { MinaDbClient } from '../../../db/client'
import { workflowRunNodeDependencies } from '../../../db/schema'
import type { WorkflowRunDependencyRepository } from './workflow-run-dependency.repository'
import type { WorkflowRunNodeDependency } from './workflow-types'

export class DrizzleWorkflowRunDependencyRepository implements WorkflowRunDependencyRepository {
  constructor(private readonly db: MinaDbClient) {}

  async listDependencies(workflowRunId: string): Promise<WorkflowRunNodeDependency[]> {
    const rows = await this.db
      .select()
      .from(workflowRunNodeDependencies)
      .where(eq(workflowRunNodeDependencies.workflowRunId, workflowRunId))
    return rows.map((row) => ({
      workflowRunId: row.workflowRunId,
      nodeId: row.nodeId,
      dependsOnNodeId: row.dependsOnNodeId,
    }))
  }
}
