import type { WorkflowYDocHandles, WorkflowYSnapshot } from './yjs-document'
import { exportWorkflowSnapshotFromYjs } from './yjs-document'

export const exportWorkflowYjsSnapshot = (y: WorkflowYDocHandles): WorkflowYSnapshot =>
  exportWorkflowSnapshotFromYjs(y)
