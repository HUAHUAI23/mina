import type { XYPosition } from '@xyflow/react'

import type { WebMessages } from '../../../lib/i18n-messages'
import { formValueToTask } from '../forms/model-form-utils'
import { selectWorkflowCanvasNodes } from '../store/canvas-selection-actions'
import type { ComposerDraftState } from '../store/canvas-ui-store'
import { rememberLastComposerModel } from '../store/canvas-ui-store'
import type { CanvasStore } from '../store/store-types'

type AddMediaGenerationNode = CanvasStore['addMediaGenerationNode']
type MediaGenerationNodeType = Parameters<AddMediaGenerationNode>[0]['nodeType']

export interface SubmitComposerDraftDependencies {
  addMediaGenerationNode: AddMediaGenerationNode
  focusNode(nodeId: string): void
  getNewNodePosition(nodeType: MediaGenerationNodeType): XYPosition | undefined
  openNodePanel(nodeId: string, panel: 'config'): void
  resetComposerDraft(): void
  setDraftError(error: string | undefined): void
  setDraftExpanded(expanded: boolean): void
}

export const submitComposerDraft = async (
  snapshot: ComposerDraftState,
  dependencies: SubmitComposerDraftDependencies,
  m: WebMessages,
): Promise<void> => {
  if (Object.values(snapshot.uploads).some((entry) => entry.status === 'uploading')) {
    dependencies.setDraftExpanded(true)
    dependencies.setDraftError(m.workflow_canvas_error_uploading_media())
    return
  }

  try {
    const nodeId = dependencies.addMediaGenerationNode({
      mediaSlots: snapshot.mediaSlots,
      nodeType: snapshot.task.kind,
      position: dependencies.getNewNodePosition(snapshot.task.kind),
      task: formValueToTask(snapshot.task),
    })
    rememberLastComposerModel(snapshot.task)
    selectWorkflowCanvasNodes([nodeId])
    dependencies.openNodePanel(nodeId, 'config')
    dependencies.resetComposerDraft()
    dependencies.focusNode(nodeId)
  } catch (error) {
    dependencies.setDraftExpanded(true)
    dependencies.setDraftError(error instanceof Error ? error.message : m.workflow_canvas_error_failed_create_node())
  }
}
