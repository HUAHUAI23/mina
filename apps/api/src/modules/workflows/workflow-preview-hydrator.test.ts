import { describe, expect, test } from 'bun:test'
import type { WorkflowPreviewImage, WorkflowSummary } from '@mina/contracts/modules/workflows'

import { WorkflowPreviewHydrator, type WorkflowPreviewRepository } from './workflow-preview-hydrator'

const workflow = (id: string): WorkflowSummary => ({
  accountId: 'account_1',
  createdAt: '2026-06-08T00:00:00.000Z',
  id,
  name: id,
  updatedAt: '2026-06-08T00:00:00.000Z',
  version: 1,
})

describe('WorkflowPreviewHydrator', () => {
  test('hydrates workflow summaries from batched latest image previews', async () => {
    const previews = new Map<string, WorkflowPreviewImage>([
      ['workflow_2', { kind: 'image', mediaObjectId: 'media_latest', url: 's3://bucket/latest.png' }],
    ])
    const repository: WorkflowPreviewRepository = {
      listLatestImagePreviews: async (accountId, workflowIds) => {
        expect(accountId).toBe('account_1')
        expect(workflowIds).toEqual(['workflow_1', 'workflow_2'])
        return previews
      },
    }
    const hydrator = new WorkflowPreviewHydrator(repository)

    await expect(hydrator.hydrate([workflow('workflow_1'), workflow('workflow_2')])).resolves.toEqual([
      workflow('workflow_1'),
      {
        ...workflow('workflow_2'),
        previewImage: { kind: 'image', mediaObjectId: 'media_latest', url: 's3://bucket/latest.png' },
      },
    ])
  })
})
