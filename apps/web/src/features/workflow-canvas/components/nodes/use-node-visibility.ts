import { useNodeId, useStore } from '@xyflow/react'

const VISIBILITY_MARGIN_PX = 240

export const useCurrentNodeVisible = (): boolean => {
  const nodeId = useNodeId()
  return useStore(
    (state) => {
      if (!nodeId) {
        return true
      }
      const node = state.nodeLookup.get(nodeId)
      if (!node) {
        return true
      }
      const width = node.measured.width ?? node.width ?? 0
      const height = node.measured.height ?? node.height ?? 0
      const [viewportX, viewportY, zoom] = state.transform
      const left = node.internals.positionAbsolute.x * zoom + viewportX
      const top = node.internals.positionAbsolute.y * zoom + viewportY
      const right = left + width * zoom
      const bottom = top + height * zoom
      return (
        right >= -VISIBILITY_MARGIN_PX &&
        bottom >= -VISIBILITY_MARGIN_PX &&
        left <= state.width + VISIBILITY_MARGIN_PX &&
        top <= state.height + VISIBILITY_MARGIN_PX
      )
    },
    Object.is,
  )
}
