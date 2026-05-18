import type { NodeMediaViewState } from '@mina/contracts/modules/canvas'
import type { Workflow } from '@mina/contracts/modules/workflows'

export type WorkflowSummary = Omit<Workflow, 'edges' | 'nodes'>

export interface WorkflowDefinitionCreate {
  accountId: string
  edges: Workflow['edges']
  id: string
  name: string
  nodes: Workflow['nodes']
  timestamp: string
  version: number
}

export interface ReplaceWorkflowDefinitionInput {
  edges: Workflow['edges']
  id: string
  name: string
  nodes: Workflow['nodes']
  timestamp: string
  version: number
}

export interface UpdateNodeMediaViewPersistenceInput {
  mediaView: NodeMediaViewState | undefined
  nodeId: string
  timestamp: string
  workflowId: string
}

export interface WorkflowDefinitionRepository {
  create(input: WorkflowDefinitionCreate): Promise<Workflow>
  delete(id: string): Promise<boolean>
  findById(id: string): Promise<Workflow | undefined>
  list(accountId?: string): Promise<Workflow[]>
  replaceDefinition(input: ReplaceWorkflowDefinitionInput): Promise<Workflow>
  updateNodeMediaView(input: UpdateNodeMediaViewPersistenceInput): Promise<Workflow>
}
