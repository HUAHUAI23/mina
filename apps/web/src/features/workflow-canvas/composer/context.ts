import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import type { ComposerContext } from './types'

export const composerContextFromSelection = (
  selectedNodeIds: readonly string[],
  activeNode: WorkflowCanvasNode | undefined,
): ComposerContext => {
  if (selectedNodeIds.length > 1) {
    return { kind: 'multi', nodeIds: [...selectedNodeIds] }
  }
  if (activeNode) {
    return { kind: 'node', node: activeNode }
  }
  return { kind: 'empty' }
}
