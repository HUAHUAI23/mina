import type { NodeMediaViewState } from '@mina/contracts/modules/canvas'
import type { NodeExecutionOutput, NodeOutputResource } from '@mina/contracts/modules/tasks'

export const resolveMediaViewResource = (
  output: NodeExecutionOutput | undefined,
  mediaView: NodeMediaViewState | undefined,
): NodeOutputResource | undefined => {
  if (!output?.resources.length) {
    return undefined
  }
  if (mediaView?.outputResourceId) {
    const byId = output.resources.find((resource) => resource.id === mediaView.outputResourceId)
    if (byId) {
      return byId
    }
  }
  if (mediaView?.outputIndex !== undefined) {
    return output.resources[mediaView.outputIndex]
  }
  return output.resources[0]
}

export const selectableResources = (output: NodeExecutionOutput | undefined): NodeOutputResource[] =>
  output?.resources.filter((resource) => resource.kind === 'image' || resource.kind === 'video') ?? []
