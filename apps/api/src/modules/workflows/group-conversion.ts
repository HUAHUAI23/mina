import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import { getNodeMap, isDescendantOf } from './graph'

const downgradeNodeMediaSlots = (node: WorkflowCanvasNode): WorkflowCanvasNode => {
  if (node.data.nodeType !== 'image_generation' && node.data.nodeType !== 'video_generation') {
    return node
  }

  const mediaSlots = node.data.mediaSlots
  if (!mediaSlots) {
    return node
  }

  return {
    ...node,
    data: {
      ...node.data,
      mediaSlots: Object.fromEntries(
        Object.entries(mediaSlots).map(([slot, items]) => [
          slot,
          items.map((item) =>
            item.source.type === 'node_output' && item.source.resolve === 'run_output'
              ? {
                  ...item,
                  source: {
                    type: 'node_output' as const,
                    nodeId: item.source.nodeId,
                    resolve: 'current_media' as const,
                  },
                }
              : item,
          ),
        ]),
      ),
    },
  }
}

export const downgradeFlowGroupToNodeGroup = (
  nodes: readonly WorkflowCanvasNode[],
  flowGroupNodeId: string,
): WorkflowCanvasNode[] => {
  const nodeMap = getNodeMap([...nodes])
  return nodes.map((node) => {
    if (node.id === flowGroupNodeId && node.data.nodeType === 'flow_group') {
      return {
        ...node,
        type: 'node_group',
        data: {
          nodeType: 'node_group',
          title: node.data.title,
          config: node.data.config,
        },
      }
    }

    if (isDescendantOf(node.id, flowGroupNodeId, nodeMap)) {
      return downgradeNodeMediaSlots(node)
    }

    return node
  })
}
