import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import type { Workflow } from '@mina/contracts/modules/workflows'
import { and, asc, desc, eq, isNull } from 'drizzle-orm'

import type { MinaDbClient, MinaDbTransaction } from '../../../db/client'
import { workflowEdges, workflowNodes, workflows } from '../../../db/schema'
import {
  normalizeWorkflowEdge,
  normalizeWorkflowNode,
  toIso,
  workflowDto,
} from './workflow-mappers'
import type {
  ReplaceWorkflowDefinitionInput,
  WorkflowDefinitionCreate,
  WorkflowDefinitionRepository,
} from './workflow-definition.repository'

type WorkflowRow = typeof workflows.$inferSelect
type WorkflowNodeRow = typeof workflowNodes.$inferSelect
type WorkflowEdgeRow = typeof workflowEdges.$inferSelect
type DefinitionDb = MinaDbClient | MinaDbTransaction

const nodeInsertRows = (
  workflowId: string,
  nodes: WorkflowCanvasNode[],
  timestamp: string,
): Array<typeof workflowNodes.$inferInsert> =>
  nodes.map((node, index) => ({
    workflowId,
    nodeId: node.id,
    type: node.type,
    positionX: String(node.position.x),
    positionY: String(node.position.y),
    parentId: node.parentId ?? null,
    extent: node.extent ?? null,
    width: node.width === undefined ? null : String(node.width),
    height: node.height === undefined ? null : String(node.height),
    data: node.data,
    sortOrder: index,
    createdAt: new Date(timestamp),
    updatedAt: new Date(timestamp),
  }))

const edgeInsertRows = (
  workflowId: string,
  edges: WorkflowCanvasEdge[],
  timestamp: string,
): Array<typeof workflowEdges.$inferInsert> =>
  edges.map((edge, index) => ({
    workflowId,
    edgeId: edge.id,
    type: edge.type ?? 'media',
    sourceNodeId: edge.source,
    targetNodeId: edge.target,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
    data: edge.data,
    sortOrder: index,
    createdAt: new Date(timestamp),
    updatedAt: new Date(timestamp),
  }))

export const nodeFromDefinitionRow = (row: WorkflowNodeRow): WorkflowCanvasNode =>
  normalizeWorkflowNode({
    id: row.nodeId,
    type: row.type,
    position: {
      x: Number(row.positionX),
      y: Number(row.positionY),
    },
    ...(row.parentId ? { parentId: row.parentId } : {}),
    ...(row.extent ? { extent: row.extent } : {}),
    ...(row.width !== null ? { width: Number(row.width) } : {}),
    ...(row.height !== null ? { height: Number(row.height) } : {}),
    data: row.data,
  })

export const edgeFromDefinitionRow = (row: WorkflowEdgeRow): WorkflowCanvasEdge =>
  normalizeWorkflowEdge({
    id: row.edgeId,
    type: row.type as WorkflowCanvasEdge['type'],
    source: row.sourceNodeId,
    target: row.targetNodeId,
    ...(row.sourceHandle ? { sourceHandle: row.sourceHandle } : {}),
    ...(row.targetHandle ? { targetHandle: row.targetHandle } : {}),
    data: row.data,
  })

const assembleWorkflow = (
  row: WorkflowRow,
  nodes: WorkflowNodeRow[],
  edges: WorkflowEdgeRow[],
): Workflow =>
  workflowDto({
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    version: row.version,
    nodes: nodes.sort((left, right) => left.sortOrder - right.sortOrder).map(nodeFromDefinitionRow),
    edges: edges.sort((left, right) => left.sortOrder - right.sortOrder).map(edgeFromDefinitionRow),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  })

const readWorkflow = async (db: DefinitionDb, id: string): Promise<Workflow | undefined> => {
  const [row] = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, id), isNull(workflows.deletedAt)))
    .limit(1)
  if (!row) {
    return undefined
  }

  const [nodes, edges] = await Promise.all([
    db.select().from(workflowNodes).where(eq(workflowNodes.workflowId, id)).orderBy(asc(workflowNodes.sortOrder)),
    db.select().from(workflowEdges).where(eq(workflowEdges.workflowId, id)).orderBy(asc(workflowEdges.sortOrder)),
  ])
  return assembleWorkflow(row, nodes, edges)
}

export class DrizzleWorkflowDefinitionRepository implements WorkflowDefinitionRepository {
  constructor(private readonly db: MinaDbClient) {}

  async create(input: WorkflowDefinitionCreate): Promise<Workflow> {
    await this.db.transaction(async (tx) => {
      await tx.insert(workflows).values({
        id: input.id,
        accountId: input.accountId,
        name: input.name,
        version: input.version,
        deletedAt: null,
        createdAt: new Date(input.timestamp),
        updatedAt: new Date(input.timestamp),
      })
      const nodes = nodeInsertRows(input.id, input.nodes, input.timestamp)
      if (nodes.length > 0) {
        await tx.insert(workflowNodes).values(nodes)
      }
      const edges = edgeInsertRows(input.id, input.edges, input.timestamp)
      if (edges.length > 0) {
        await tx.insert(workflowEdges).values(edges)
      }
    })

    const workflow = await this.findById(input.id)
    if (!workflow) {
      throw new Error('Workflow was not persisted.')
    }
    return workflow
  }

  async delete(id: string): Promise<boolean> {
    const [row] = await this.db
      .update(workflows)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(workflows.id, id), isNull(workflows.deletedAt)))
      .returning({ id: workflows.id })

    return row !== undefined
  }

  async findById(id: string): Promise<Workflow | undefined> {
    return readWorkflow(this.db, id)
  }

  async list(accountId?: string): Promise<Workflow[]> {
    const rows = accountId
      ? await this.db
          .select()
          .from(workflows)
          .where(and(eq(workflows.accountId, accountId), isNull(workflows.deletedAt)))
          .orderBy(desc(workflows.updatedAt))
      : await this.db.select().from(workflows).where(isNull(workflows.deletedAt)).orderBy(desc(workflows.updatedAt))

    const items: Workflow[] = []
    for (const row of rows) {
      const workflow = await readWorkflow(this.db, row.id)
      if (workflow) {
        items.push(workflow)
      }
    }
    return items
  }

  async replaceDefinition(input: ReplaceWorkflowDefinitionInput): Promise<Workflow> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(workflows)
        .set({
          name: input.name,
          version: input.version,
          updatedAt: new Date(input.timestamp),
        })
        .where(and(eq(workflows.id, input.id), isNull(workflows.deletedAt)))
        .returning({ id: workflows.id })
      if (!row) {
        throw new Error('Workflow not found.')
      }

      await tx.delete(workflowEdges).where(eq(workflowEdges.workflowId, input.id))
      await tx.delete(workflowNodes).where(eq(workflowNodes.workflowId, input.id))

      const nodes = nodeInsertRows(input.id, input.nodes, input.timestamp)
      if (nodes.length > 0) {
        await tx.insert(workflowNodes).values(nodes)
      }
      const edges = edgeInsertRows(input.id, input.edges, input.timestamp)
      if (edges.length > 0) {
        await tx.insert(workflowEdges).values(edges)
      }
    })

    const workflow = await this.findById(input.id)
    if (!workflow) {
      throw new Error('Workflow not found.')
    }
    return workflow
  }

}

export const workflowDefinitionNodeInsertRows = nodeInsertRows
export const workflowDefinitionEdgeInsertRows = edgeInsertRows
