import { and, asc, eq, gt, inArray } from 'drizzle-orm'

import type { MinaDbClient } from '../../../db/client'
import { workflowYjsSnapshots, workflowYjsUpdates } from '../../../db/schema'
import type {
  WorkflowYjsRepository,
  WorkflowYjsSnapshotRecord,
  WorkflowYjsUpdateRecord,
} from './workflow-yjs-repository'

const toUint8Array = (value: Buffer | Uint8Array): Uint8Array =>
  value instanceof Uint8Array ? value : new Uint8Array(value)

export class DrizzleWorkflowYjsRepository implements WorkflowYjsRepository {
  constructor(private readonly db: MinaDbClient) {}

  async appendUpdate(input: { id: string; updateBin: Uint8Array; workflowId: string }): Promise<void> {
    await this.db.insert(workflowYjsUpdates).values({
      id: input.id,
      updateBin: Buffer.from(input.updateBin),
      workflowId: input.workflowId,
    })
  }

  async deleteUpdates(workflowId: string, updateIds?: readonly string[]): Promise<void> {
    if (updateIds && updateIds.length === 0) {
      return
    }
    await this.db
      .delete(workflowYjsUpdates)
      .where(
        updateIds
          ? and(eq(workflowYjsUpdates.workflowId, workflowId), inArray(workflowYjsUpdates.id, [...updateIds]))
          : eq(workflowYjsUpdates.workflowId, workflowId),
      )
  }

  async getSnapshot(workflowId: string): Promise<WorkflowYjsSnapshotRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(workflowYjsSnapshots)
      .where(eq(workflowYjsSnapshots.workflowId, workflowId))
      .limit(1)
    if (!row) {
      return undefined
    }
    return {
      snapshotBin: toUint8Array(row.snapshotBin),
      stateVector: toUint8Array(row.stateVector),
      version: row.version,
      workflowId: row.workflowId,
    }
  }

  async listUpdates(workflowId: string, after?: Date): Promise<WorkflowYjsUpdateRecord[]> {
    const rows = after
      ? await this.db
          .select()
          .from(workflowYjsUpdates)
          .where(and(eq(workflowYjsUpdates.workflowId, workflowId), gt(workflowYjsUpdates.createdAt, after)))
          .orderBy(asc(workflowYjsUpdates.createdAt))
      : await this.db
          .select()
          .from(workflowYjsUpdates)
          .where(eq(workflowYjsUpdates.workflowId, workflowId))
          .orderBy(asc(workflowYjsUpdates.createdAt))

    return rows.map((row) => ({
      createdAt: row.createdAt.toISOString(),
      id: row.id,
      updateBin: toUint8Array(row.updateBin),
      workflowId: row.workflowId,
    }))
  }

  async saveSnapshot(input: WorkflowYjsSnapshotRecord): Promise<boolean> {
    if (input.expectedVersion !== undefined) {
      const [row] = await this.db
        .update(workflowYjsSnapshots)
        .set({
          snapshotBin: Buffer.from(input.snapshotBin),
          stateVector: Buffer.from(input.stateVector),
          updatedAt: new Date(),
          version: input.version,
        })
        .where(and(
          eq(workflowYjsSnapshots.workflowId, input.workflowId),
          eq(workflowYjsSnapshots.version, input.expectedVersion),
        ))
        .returning({ workflowId: workflowYjsSnapshots.workflowId })
      return row !== undefined
    }

    await this.db
      .insert(workflowYjsSnapshots)
      .values({
        snapshotBin: Buffer.from(input.snapshotBin),
        stateVector: Buffer.from(input.stateVector),
        updatedAt: new Date(),
        version: input.version,
        workflowId: input.workflowId,
      })
      .onConflictDoUpdate({
        set: {
          snapshotBin: Buffer.from(input.snapshotBin),
          stateVector: Buffer.from(input.stateVector),
          updatedAt: new Date(),
          version: input.version,
        },
        target: workflowYjsSnapshots.workflowId,
      })
    return true
  }
}
