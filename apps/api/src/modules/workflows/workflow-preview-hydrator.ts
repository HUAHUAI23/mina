import type { WorkflowPreviewImage, WorkflowSummary } from '@mina/contracts/modules/workflows'

export interface WorkflowPreviewRepository {
  listLatestImagePreviews(accountId: string, workflowIds: readonly string[]): Promise<Map<string, WorkflowPreviewImage>>
}

export class WorkflowPreviewHydrator {
  constructor(private readonly previews: WorkflowPreviewRepository) {}

  async hydrate(workflows: readonly WorkflowSummary[]): Promise<WorkflowSummary[]> {
    if (workflows.length === 0) {
      return []
    }
    const workflowIds = workflows.map((workflow) => workflow.id)
    const previewsByWorkflow = await this.previews.listLatestImagePreviews(workflows[0]?.accountId ?? '', workflowIds)
    return workflows.map((workflow) => {
      const previewImage = previewsByWorkflow.get(workflow.id)
      return previewImage ? { ...workflow, previewImage } : workflow
    })
  }
}
