import type { WorkflowSummary } from '@mina/contracts/modules/workflows'

export type WorkflowMetadata = WorkflowSummary

export interface WorkflowDefinitionCreate {
  accountId: string
  id: string
  name: string
  timestamp: string
  version: number
}

export interface WorkflowDefinitionRepository {
  create(input: WorkflowDefinitionCreate): Promise<WorkflowMetadata>
  delete(id: string): Promise<boolean>
  findById(id: string): Promise<WorkflowMetadata | undefined>
  list(accountId?: string): Promise<WorkflowMetadata[]>
  touch(id: string, timestamp: string, version: number): Promise<WorkflowMetadata>
}
