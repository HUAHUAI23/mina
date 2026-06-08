import type { MediaSlotName, NodeOutputSelector } from '../media/media.schemas'
import type { WorkflowCanvasNode } from './canvas.schemas'

export type WorkflowGroupNodeType = Extract<WorkflowCanvasNode['data']['nodeType'], 'flow_group' | 'node_group'>

export const defaultSelectorForMediaSlot = (
  slot: MediaSlotName,
): NodeOutputSelector => {
  if (slot === 'referenceVideos') {
    return { resourceKind: 'video', role: 'generated_video', index: 0 }
  }
  if (slot === 'lastFrame') {
    return { resourceKind: 'image', role: 'last_frame', index: 0 }
  }
  if (slot === 'firstFrame') {
    return { resourceKind: 'image', role: 'first_frame', index: 0 }
  }
  return { resourceKind: 'image', role: 'generated_image', index: 0 }
}

export const workflowGroupNodeTypes = ['flow_group', 'node_group'] as const

export const isWorkflowGroupNode = (
  node: WorkflowCanvasNode | undefined,
): node is WorkflowCanvasNode & { data: Extract<WorkflowCanvasNode['data'], { nodeType: WorkflowGroupNodeType }> } =>
  node?.data.nodeType === 'flow_group' || node?.data.nodeType === 'node_group'

export const isWorkflowGroupNodeType = (
  nodeType: WorkflowCanvasNode['data']['nodeType'],
): nodeType is WorkflowGroupNodeType =>
  nodeType === 'flow_group' || nodeType === 'node_group'

export const isDescendantOfWorkflowNode = (
  nodeId: string,
  ancestorId: string,
  nodeMap: Map<string, WorkflowCanvasNode>,
): boolean => {
  let current = nodeMap.get(nodeId)
  while (current?.parentId) {
    if (current.parentId === ancestorId) {
      return true
    }
    current = nodeMap.get(current.parentId)
  }
  return false
}

const convertNodeMediaSlotSources = (
  node: WorkflowCanvasNode,
  groupNodeId: string,
  nodeMap: Map<string, WorkflowCanvasNode>,
  targetType: WorkflowGroupNodeType,
): WorkflowCanvasNode => {
  if (node.data.nodeType !== 'image_generation' && node.data.nodeType !== 'video_generation') {
    return node
  }
  if (!node.data.mediaSlots) {
    return node
  }

  return {
    ...node,
    data: {
      ...node.data,
      mediaSlots: Object.fromEntries(
        Object.entries(node.data.mediaSlots).map(([slot, items]) => [
          slot,
          items.map((item) => {
            if (item.source.type !== 'node_output') {
              return item
            }
            const sourceInGroup = isDescendantOfWorkflowNode(item.source.nodeId, groupNodeId, nodeMap)
            if (targetType === 'node_group' && item.source.resolve === 'run_output') {
              return {
                ...item,
                source: {
                  type: 'node_output' as const,
                  nodeId: item.source.nodeId,
                  resolve: 'current_media' as const,
                },
              }
            }
            if (targetType === 'flow_group' && item.source.resolve === 'current_media' && sourceInGroup) {
              return {
                ...item,
                source: {
                  type: 'node_output' as const,
                  nodeId: item.source.nodeId,
                  resolve: 'run_output' as const,
                  selector: defaultSelectorForMediaSlot(slot as MediaSlotName),
                },
              }
            }
            return item
          }),
        ]),
      ),
    },
  }
}

export const convertWorkflowGroupNodeType = (
  nodes: readonly WorkflowCanvasNode[],
  groupNodeId: string,
  targetType: WorkflowGroupNodeType,
): WorkflowCanvasNode[] => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  return nodes.map((node) => {
    if (node.id === groupNodeId && isWorkflowGroupNode(node)) {
      return {
        ...node,
        type: targetType,
        data: {
          nodeType: targetType,
          title: node.data.title,
          config: node.data.config,
        },
      }
    }

    if (isDescendantOfWorkflowNode(node.id, groupNodeId, nodeMap)) {
      return convertNodeMediaSlotSources(node, groupNodeId, nodeMap, targetType)
    }

    return node
  })
}

export const downgradeFlowGroupToNodeGroup = (
  nodes: readonly WorkflowCanvasNode[],
  flowGroupNodeId: string,
): WorkflowCanvasNode[] =>
  convertWorkflowGroupNodeType(nodes, flowGroupNodeId, 'node_group')

export const upgradeNodeGroupToFlowGroup = (
  nodes: readonly WorkflowCanvasNode[],
  nodeGroupNodeId: string,
): WorkflowCanvasNode[] =>
  convertWorkflowGroupNodeType(nodes, nodeGroupNodeId, 'flow_group')
