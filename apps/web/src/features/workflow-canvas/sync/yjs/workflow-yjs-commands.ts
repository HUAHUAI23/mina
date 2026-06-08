import type { WorkflowCanvasEdge, WorkflowCanvasNode, WorkflowNodeType } from '@mina/contracts/modules/canvas'
import {
  convertWorkflowGroupNodeType,
  isWorkflowGroupNode,
  type WorkflowGroupNodeType,
} from '@mina/contracts/modules/canvas/group-conversion'
import type { MediaSlotName, NodeMediaSlotItem, NodeMediaSlots } from '@mina/contracts/modules/media'
import type { NodeMediaViewState } from '@mina/contracts/modules/canvas'
import type { TaskDraftConfig } from '@mina/contracts/modules/tasks'

import { createWorkflowCanvasNode, isMediaGenerationNode } from '../../domain/canvas-node-types'
import {
  getLogicalGroupFrameFromChildren,
  getWorkflowNodesBoundsUnion,
} from '../../domain/canvas-node-geometry'
import {
  absoluteNodePosition,
  canAttachNodeToGroup,
  canGroupNodesAtParent,
  changedFrameNodes,
  clearParentFrame,
  fitGroupFrameToChildren,
  fitGroupsToChildren,
  nextGroupTitle,
  placeNodeInsideParent,
  reparentAfterRemovedAncestors,
  withParentFrame,
} from '../../domain/group-graph-commands'
import { createStoreId } from '../../store/store-helpers'
import type {
  AddConnectedMediaGenerationNodeInput,
  AddNodesToGroupOptions,
  AddNodeOptions,
  CanvasNodeFramePatch,
  MediaConnectionInput,
} from '../../store/store-types'
import {
  exportWorkflowSnapshotFromYjs,
  writeWorkflowNodeTaskPrompt,
  writeWorkflowTextNodeText,
  type WorkflowYDocHandles,
} from './yjs-document'
import { getWorkflowYjsRuntimeForWorkflow } from './workflow-yjs-store'
import { validateWorkflowCanvasGraph } from '../../domain/canvas-graph-validation'
import {
  deleteEdge,
  deleteNode,
  replaceNodeOrder,
  updateNode,
  upsertEdge,
  upsertNode,
  writeNodeFrame,
} from './workflow-yjs-graph-writer'
import { resolveCommittedNodeFrameNodes } from './node-frame-commands'
import {
  addSlotItemToNode,
  initializeMediaGenerationNodeData,
  removeSlotItemFromNode,
  reorderSlotItemInNode,
  reorderSlotItemsInNode,
  replaceSlotItemWithMediaObject,
  resolveConnectedMediaGenerationPatch,
  resolveMediaConnectionPatch,
  resolveNodesAfterRemovedEdges,
  setMediaViewOnNode,
  updateSlotItemInNode,
} from './media-slot-commands'

export interface WorkflowYjsCommandContext {
  edges: WorkflowCanvasEdge[]
  nodes: WorkflowCanvasNode[]
  workflowId: string
}

interface WorkflowYjsCaptureOptions {
  discrete?: boolean | undefined
}

const withYDoc = (
  context: WorkflowYjsCommandContext,
  apply: (y: WorkflowYDocHandles, workflowId: string) => void,
  options: WorkflowYjsCaptureOptions = {},
): void => {
  const runtime = getWorkflowYjsRuntimeForWorkflow(context.workflowId)
  if (!runtime) {
    throw new Error(`Yjs runtime not registered for workflow ${context.workflowId}`)
  }
  const discrete = options.discrete ?? true
  if (discrete) {
    runtime.undo.stopCapturing()
  }
  runtime.y.ydoc.transact(() => apply(runtime.y, runtime.workflowId), 'mina-local')
  if (discrete) {
    runtime.undo.stopCapturing()
  }
  if (!import.meta.env.PROD) {
    const snapshot = exportWorkflowSnapshotFromYjs(runtime.y)
    validateWorkflowCanvasGraph(snapshot.nodes, snapshot.edges)
  }
}

const withNodeFrameYDoc = (
  context: WorkflowYjsCommandContext,
  mutate: (y: WorkflowYDocHandles, workflowId: string) => void,
  options: WorkflowYjsCaptureOptions = {},
): void => {
  const runtime = getWorkflowYjsRuntimeForWorkflow(context.workflowId)
  if (!runtime) {
    return
  }
  const discrete = options.discrete ?? true
  if (discrete) {
    runtime.undo.stopCapturing()
  }
  runtime.y.ydoc.transact(() => mutate(runtime.y, runtime.workflowId), 'mina-local')
  if (discrete) {
    runtime.undo.stopCapturing()
  }
}

export const workflowYjsCommands = {
  addMediaConnection(context: WorkflowYjsCommandContext, input: MediaConnectionInput): void {
    const patch = resolveMediaConnectionPatch(context.nodes, input)
    if (!patch) {
      return
    }
    withYDoc(context, (y) => {
      updateNode(y, patch.node)
      upsertEdge(y, patch.edge)
    })
  },

  addNode(
    context: WorkflowYjsCommandContext,
    type: WorkflowNodeType,
    task?: TaskDraftConfig | undefined,
    options?: AddNodeOptions | undefined,
  ): string {
    const node = createWorkflowCanvasNode(type, context.nodes.length, task)
    if (options?.position) {
      node.position = options.position
    }
    const nodeMap = new Map(context.nodes.map((candidate) => [candidate.id, candidate]))
    const parentNode = options?.parentId ? nodeMap.get(options.parentId) : undefined
    if (parentNode && isWorkflowGroupNode(parentNode) && !isWorkflowGroupNode(node)) {
      const childNode = placeNodeInsideParent(node, parentNode, node.position, nodeMap)
      const nextNodes = fitGroupsToChildren([...context.nodes, childNode])
      const framedChildNode = nextNodes.find((candidate) => candidate.id === childNode.id) ?? childNode
      const changedExistingNodes = changedFrameNodes(context.nodes, nextNodes)
      withYDoc(context, (y) => {
        upsertNode(y, framedChildNode)
        for (const changedNode of changedExistingNodes) {
          updateNode(y, changedNode)
          writeNodeFrame(y, changedNode)
        }
        replaceNodeOrder(y, nextNodes)
      })
      return node.id
    }
    withYDoc(context, (y) => upsertNode(y, node))
    return node.id
  },

  addNodesToGroup(
    context: WorkflowYjsCommandContext,
    groupNodeId: string,
    nodeIds: readonly string[],
    options: AddNodesToGroupOptions = {},
  ): string[] {
    const requestedIds = new Set(nodeIds)
    if (requestedIds.size === 0) {
      return []
    }
    const nodeMap = new Map(context.nodes.map((node) => [node.id, node]))
    const groupNode = nodeMap.get(groupNodeId)
    if (!isWorkflowGroupNode(groupNode)) {
      return []
    }
    const groupAbsolutePosition = absoluteNodePosition(groupNode, nodeMap)
    const attachedNodes = context.nodes
      .filter((node) => requestedIds.has(node.id) && canAttachNodeToGroup(node, groupNode, nodeMap))
      .map((node) => {
        const absolutePosition = options.absolutePositionsByNodeId?.[node.id] ?? absoluteNodePosition(node, nodeMap)
        return withParentFrame(
          node,
          groupNode.id,
          {
            x: absolutePosition.x - groupAbsolutePosition.x,
            y: absolutePosition.y - groupAbsolutePosition.y,
          },
        )
      })
    if (attachedNodes.length === 0) {
      return []
    }
    const attachedById = new Map(attachedNodes.map((node) => [node.id, node]))
    const nextNodes = fitGroupsToChildren(context.nodes.map((node) => attachedById.get(node.id) ?? node))
    const framedAttachedNodes = nextNodes.filter((node) => attachedById.has(node.id))
    const changedExistingNodes = changedFrameNodes(context.nodes, nextNodes)
    withYDoc(context, (y) => {
      for (const node of changedExistingNodes) {
        updateNode(y, node)
        writeNodeFrame(y, node)
      }
      replaceNodeOrder(y, nextNodes)
    })
    return framedAttachedNodes.map((node) => node.id)
  },

  addMediaGenerationNode(context: WorkflowYjsCommandContext, input: {
    mediaSlots?: NodeMediaSlots | undefined
    nodeType: Extract<WorkflowNodeType, 'image_generation' | 'video_generation'>
    parentId?: string | undefined
    position?: { x: number; y: number } | undefined
    task: TaskDraftConfig
  }): string {
    const node = createWorkflowCanvasNode(input.nodeType, context.nodes.length, input.task)
    if (!isMediaGenerationNode(node)) {
      return node.id
    }
    if (input.position) {
      node.position = input.position
    }
    initializeMediaGenerationNodeData(node, input)
    const nodeMap = new Map(context.nodes.map((candidate) => [candidate.id, candidate]))
    const parentNode = input.parentId ? nodeMap.get(input.parentId) : undefined
    if (parentNode && isWorkflowGroupNode(parentNode)) {
      const childNode = placeNodeInsideParent(node, parentNode, node.position, nodeMap)
      const nextNodes = fitGroupsToChildren([...context.nodes, childNode])
      const framedChildNode = nextNodes.find((candidate) => candidate.id === childNode.id) ?? childNode
      const changedExistingNodes = changedFrameNodes(context.nodes, nextNodes)
      withYDoc(context, (y) => {
        upsertNode(y, framedChildNode)
        for (const changedNode of changedExistingNodes) {
          updateNode(y, changedNode)
          writeNodeFrame(y, changedNode)
        }
        replaceNodeOrder(y, nextNodes)
      })
      return node.id
    }
    withYDoc(context, (y) => upsertNode(y, node))
    return node.id
  },

  addConnectedMediaGenerationNode(
    context: WorkflowYjsCommandContext,
    input: AddConnectedMediaGenerationNodeInput,
  ): string | undefined {
    const node = createWorkflowCanvasNode(input.nodeType, context.nodes.length, input.task)
    node.position = input.position
    const patch = resolveConnectedMediaGenerationPatch(context.nodes, node, input)
    if (!patch) {
      return undefined
    }

    withYDoc(context, (y) => {
      upsertNode(y, patch.node)
      upsertEdge(y, patch.edge)
    })
    return node.id
  },

  groupGraphNodes(context: WorkflowYjsCommandContext, nodeIds: readonly string[], groupType: WorkflowGroupNodeType): string | undefined {
    const selectedIds = new Set(nodeIds)
    if (selectedIds.size < 2) {
      return undefined
    }
    const nodeMap = new Map(context.nodes.map((node) => [node.id, node]))
    const selectedNodes = context.nodes.filter((node) => selectedIds.has(node.id))
    if (selectedNodes.length < 2 || selectedNodes.some((node) => isWorkflowGroupNode(node))) {
      return undefined
    }
    const parentId = selectedNodes[0]?.parentId
    if (selectedNodes.some((node) => node.parentId !== parentId)) {
      return undefined
    }
    if (!canGroupNodesAtParent(parentId)) {
      return undefined
    }
    const bounds = getWorkflowNodesBoundsUnion(selectedNodes, nodeMap)
    if (!bounds) {
      return undefined
    }
    const groupFrame = getLogicalGroupFrameFromChildren(bounds)
    const parentAbsolutePosition = parentId ? absoluteNodePosition(nodeMap.get(parentId) ?? selectedNodes[0]!, nodeMap) : undefined
    const groupNode: WorkflowCanvasNode = {
      data: { nodeType: groupType, title: nextGroupTitle(groupType), config: {} },
      height: groupFrame.height,
      id: createStoreId('group'),
      position: parentId
        ? {
            x: groupFrame.absolutePosition.x - (parentAbsolutePosition?.x ?? 0),
            y: groupFrame.absolutePosition.y - (parentAbsolutePosition?.y ?? 0),
          }
        : groupFrame.absolutePosition,
      type: groupType,
      width: groupFrame.width,
      ...(parentId ? { extent: 'parent' as const, parentId } : {}),
    }
    const groupAbsolutePosition = parentId
      ? absoluteNodePosition(groupNode, new Map([...nodeMap, [groupNode.id, groupNode]]))
      : groupNode.position
    const groupedNodes = [
      ...context.nodes.map((node) => {
        if (!selectedIds.has(node.id)) {
          return node
        }
        const absolutePosition = absoluteNodePosition(node, nodeMap)
        return withParentFrame(
          node,
          groupNode.id,
          {
            x: absolutePosition.x - groupAbsolutePosition.x,
            y: absolutePosition.y - groupAbsolutePosition.y,
          },
        )
      }),
      groupNode,
    ]
    const typedGroupedNodes = groupType === 'flow_group'
      ? convertWorkflowGroupNodeType(groupedNodes, groupNode.id, 'flow_group')
      : groupedNodes
    const nextNodes = fitGroupsToChildren(typedGroupedNodes)
    withYDoc(context, (y) => {
      const nextGroupNode = nextNodes.find((node) => node.id === groupNode.id) ?? groupNode
      upsertNode(y, nextGroupNode)
      for (const node of nextNodes) {
        if (selectedIds.has(node.id)) {
          updateNode(y, node)
          writeNodeFrame(y, node)
        }
      }
      replaceNodeOrder(y, nextNodes)
    })
    return groupNode.id
  },

  detachGraphNodes(context: WorkflowYjsCommandContext, nodeIds: readonly string[]): void {
    const nodeMap = new Map(context.nodes.map((node) => [node.id, node]))
    const detachedIds = new Set(nodeIds)
    const detachedById = new Map(context.nodes
      .filter((node) => detachedIds.has(node.id) && node.parentId)
      .map((node) => ({
        ...clearParentFrame(node),
        position: absoluteNodePosition(node, nodeMap),
      }))
      .map((node) => [node.id, node] as const))
    if (detachedById.size === 0) {
      return
    }
    const nextNodes = fitGroupsToChildren(context.nodes.map((node) => detachedById.get(node.id) ?? node))
    const nextChangedFrameNodes = changedFrameNodes(context.nodes, nextNodes)
    withYDoc(context, (y) => {
      for (const node of nextChangedFrameNodes) {
        updateNode(y, node)
        writeNodeFrame(y, node)
      }
    })
  },

  ungroupGraphNode(context: WorkflowYjsCommandContext, nodeId: string): void {
    const nodeMap = new Map(context.nodes.map((node) => [node.id, node]))
    const groupNode = nodeMap.get(nodeId)
    if (!isWorkflowGroupNode(groupNode)) {
      return
    }
    const groupAbsolutePosition = absoluteNodePosition(groupNode, nodeMap)
    const childNodes = context.nodes
      .filter((node) => node.parentId === nodeId)
      .map((node) => {
        const nextParent = groupNode.parentId
        const nextPosition = nextParent
          ? {
              x: groupNode.position.x + node.position.x,
              y: groupNode.position.y + node.position.y,
            }
          : {
              x: groupAbsolutePosition.x + node.position.x,
              y: groupAbsolutePosition.y + node.position.y,
            }
        const nextNode = {
          ...node,
          position: nextPosition,
        }
        return nextParent
          ? { ...nextNode, extent: 'parent' as const, parentId: nextParent }
          : clearParentFrame(nextNode)
      })
    const childIds = new Set(childNodes.map((node) => node.id))
    const removedEdges = context.edges.filter((edge) => edge.source === nodeId || edge.target === nodeId)
    const nextNodes = fitGroupsToChildren(context.nodes
      .filter((node) => node.id !== nodeId)
      .map((node) => childIds.has(node.id) ? childNodes.find((child) => child.id === node.id) ?? node : node))
    const nextChangedFrameNodes = changedFrameNodes(context.nodes, nextNodes)
    withYDoc(context, (y) => {
      deleteNode(y, nodeId)
      for (const edge of removedEdges) {
        deleteEdge(y, edge.id)
      }
      for (const node of nextChangedFrameNodes) {
        updateNode(y, node)
        writeNodeFrame(y, node)
      }
      replaceNodeOrder(y, nextNodes)
    })
  },

  convertGroupNodeType(context: WorkflowYjsCommandContext, nodeId: string, targetType: WorkflowGroupNodeType): void {
    const sourceNode = context.nodes.find((node) => node.id === nodeId)
    if (!isWorkflowGroupNode(sourceNode) || sourceNode.data.nodeType === targetType) {
      return
    }
    const nextNodes = convertWorkflowGroupNodeType(context.nodes, nodeId, targetType)
    const nextNodeIds = new Set(nextNodes.map((node) => node.id))
    const changedNodes = nextNodes.filter((nextNode) => {
      const current = context.nodes.find((node) => node.id === nextNode.id)
      return current && JSON.stringify(current) !== JSON.stringify(nextNode)
    })
    if (changedNodes.length === 0 || !nextNodeIds.has(nodeId)) {
      return
    }
    withYDoc(context, (y) => {
      for (const node of changedNodes) {
        updateNode(y, node)
        writeNodeFrame(y, node)
      }
    })
  },

  fitGroupNodeToChildren(context: WorkflowYjsCommandContext, nodeId: string): void {
    const nodeMap = new Map(context.nodes.map((node) => [node.id, node]))
    const groupNode = nodeMap.get(nodeId)
    if (!isWorkflowGroupNode(groupNode)) {
      return
    }
    const childNodes = context.nodes.filter((node) => node.parentId === nodeId)
    const groupFrame = fitGroupFrameToChildren(groupNode, childNodes, nodeMap)
    const nextChildById = new Map(groupFrame.children.map((node) => [node.id, node]))
    const nextNodes = fitGroupsToChildren(context.nodes.map((node) => {
      if (node.id === nodeId) {
        return groupFrame.group
      }
      return nextChildById.get(node.id) ?? node
    }))
    const nextChangedFrameNodes = changedFrameNodes(context.nodes, nextNodes)
    if (nextChangedFrameNodes.length === 0) {
      return
    }
    withYDoc(context, (y) => {
      for (const node of nextChangedFrameNodes) {
        updateNode(y, node)
        writeNodeFrame(y, node)
      }
      replaceNodeOrder(y, nextNodes)
    })
  },

  commitNodeFrames(context: WorkflowYjsCommandContext, frames: readonly CanvasNodeFramePatch[]): void {
    const changedNodes = resolveCommittedNodeFrameNodes(context.nodes, frames)
    if (changedNodes.length === 0) {
      return
    }
    withNodeFrameYDoc(context, (y) => {
      for (const node of changedNodes) {
        writeNodeFrame(y, node)
      }
    })
  },

  removeGraphEdges(context: WorkflowYjsCommandContext, edgeIds: readonly string[]): void {
    const removedIds = new Set(edgeIds)
    if (removedIds.size === 0) {
      return
    }
    const { edges, nodes } = context
    const removedEdges = edges.filter((edge) => removedIds.has(edge.id))
    if (removedEdges.length === 0) {
      return
    }
    const nextNodes = resolveNodesAfterRemovedEdges(nodes, removedEdges)
    const touchedNodes = new Set(removedEdges.map((edge) => edge.target))
    const touchedNextNodes = nextNodes.filter((node) => touchedNodes.has(node.id))
    withYDoc(context, (y) => {
      for (const edgeId of removedIds) {
        deleteEdge(y, edgeId)
      }
      for (const node of touchedNextNodes) {
        updateNode(y, node)
      }
    })
  },

  removeGraphNodes(context: WorkflowYjsCommandContext, nodeIds: readonly string[]): void {
    const removedIds = new Set(nodeIds)
    if (removedIds.size === 0) {
      return
    }
    const { edges, nodes } = context
    const nodeMap = new Map(nodes.map((node) => [node.id, node]))
    const removedGroupIds = new Set(nodes.filter((node) => removedIds.has(node.id) && isWorkflowGroupNode(node)).map((node) => node.id))
    const preservedChildren = nodes
      .filter((node) => node.parentId && removedGroupIds.has(node.parentId) && !removedIds.has(node.id))
      .map((node) => reparentAfterRemovedAncestors(node, nodeMap, removedIds))
    const preservedChildIds = new Set(preservedChildren.map((node) => node.id))
    const nodesAfterRemoval = nodes
      .filter((node) => !removedIds.has(node.id))
      .map((node) => preservedChildIds.has(node.id) ? preservedChildren.find((child) => child.id === node.id) ?? node : node)
    const removedEdges = edges.filter((edge) => removedIds.has(edge.source) || removedIds.has(edge.target))
    const nextNodes = resolveNodesAfterRemovedEdges(nodesAfterRemoval, removedEdges)
    const touchedNodes = new Set(removedEdges.map((edge) => edge.target).filter((nodeId) => !removedIds.has(nodeId)))
    const touchedNextNodes = nextNodes.filter((node) => touchedNodes.has(node.id))
    const fittedNextNodes = fitGroupsToChildren(nextNodes)
    const nextChangedFrameNodes = changedFrameNodes(nodes, fittedNextNodes)
    withYDoc(context, (y) => {
      for (const nodeId of removedIds) {
        deleteNode(y, nodeId)
      }
      for (const edge of removedEdges) {
        deleteEdge(y, edge.id)
      }
      for (const node of touchedNextNodes) {
        updateNode(y, node)
      }
      for (const node of nextChangedFrameNodes) {
        updateNode(y, node)
        writeNodeFrame(y, node)
      }
    })
  },

  setNodeFrame(context: WorkflowYjsCommandContext, input: CanvasNodeFramePatch): void {
    workflowYjsCommands.commitNodeFrames(context, [input])
  },

  updateNodeById(context: WorkflowYjsCommandContext, nodeId: string, update: (node: WorkflowCanvasNode) => WorkflowCanvasNode | undefined): void {
    const node = context.nodes.find((candidate) => candidate.id === nodeId)
    if (!node) {
      return
    }
    const next = update(structuredClone(node))
    if (!next) {
      return
    }
    withYDoc(context, (y) => updateNode(y, next))
  },

  addSlotItem(context: WorkflowYjsCommandContext, nodeId: string, item: NodeMediaSlotItem): void {
    workflowYjsCommands.updateNodeById(context, nodeId, (node) => {
      return addSlotItemToNode(node, item)
    })
  },

  removeSlotItem(context: WorkflowYjsCommandContext, nodeId: string, slot: MediaSlotName, slotItemId: string): void {
    const { edges } = context
    const removedEdgeIds = edges
      .filter((edge) => edge.data.connection?.targetSlotItemId === slotItemId)
      .map((edge) => edge.id)
    const currentNode = context.nodes.find((node) => node.id === nodeId)
    if (!currentNode) {
      return
    }
    const nextNode = removeSlotItemFromNode(structuredClone(currentNode), slot, slotItemId)
    if (!nextNode) {
      return
    }
    withYDoc(context, (y) => {
      updateNode(y, nextNode)
      for (const edgeId of removedEdgeIds) {
        deleteEdge(y, edgeId)
      }
    })
  },

  reorderSlotItem(context: WorkflowYjsCommandContext, nodeId: string, slot: MediaSlotName, slotItemId: string, direction: -1 | 1): void {
    workflowYjsCommands.updateNodeById(context, nodeId, (node) => {
      return reorderSlotItemInNode(node, slot, slotItemId, direction)
    })
  },

  reorderSlotItems(context: WorkflowYjsCommandContext, nodeId: string, slot: MediaSlotName, orderedIds: readonly string[]): void {
    workflowYjsCommands.updateNodeById(context, nodeId, (node) => {
      return reorderSlotItemsInNode(node, slot, orderedIds)
    })
  },

  replaceSlotItemMediaObject(context: WorkflowYjsCommandContext, nodeId: string, slot: MediaSlotName, slotItemId: string, mediaObjectId: string): void {
    const currentNode = context.nodes.find((node) => node.id === nodeId)
    if (!currentNode) {
      return
    }
    const nextNode = replaceSlotItemWithMediaObject(structuredClone(currentNode), slot, slotItemId, mediaObjectId)
    if (!nextNode) {
      return
    }
    const removedEdgeIds = context.edges
      .filter((edge) => edge.data.connection?.targetSlotItemId === slotItemId)
      .map((edge) => edge.id)
    withYDoc(context, (y) => {
      updateNode(y, nextNode)
      for (const edgeId of removedEdgeIds) {
        deleteEdge(y, edgeId)
      }
    })
  },

  setNodeMediaView(context: WorkflowYjsCommandContext, nodeId: string, mediaView: NodeMediaViewState | undefined): void {
    workflowYjsCommands.updateNodeById(context, nodeId, (node) => {
      return setMediaViewOnNode(node, mediaView)
    })
  },

  updateSlotItem(context: WorkflowYjsCommandContext, nodeId: string, item: NodeMediaSlotItem): void {
    workflowYjsCommands.updateNodeById(context, nodeId, (node) => {
      return updateSlotItemInNode(node, item)
    })
  },

  setNodeTaskConfig(context: WorkflowYjsCommandContext, nodeId: string, task: TaskDraftConfig): void {
    workflowYjsCommands.updateNodeById(context, nodeId, (node) => {
      if (!isMediaGenerationNode(node)) {
        return undefined
      }
      node.data.config.task = task
      return node
    })
  },

  setNodeTaskPrompt(context: WorkflowYjsCommandContext, nodeId: string, prompt: string): void {
    const node = context.nodes.find((candidate) => candidate.id === nodeId)
    if (!node || !isMediaGenerationNode(node)) {
      return
    }
    if (!node.data.config.task) {
      return
    }
    withYDoc(context, (y) => {
      writeWorkflowNodeTaskPrompt(y.nodes, nodeId, prompt)
    }, { discrete: false })
  },

  setNodeText(context: WorkflowYjsCommandContext, nodeId: string, text: string): void {
    const node = context.nodes.find((candidate) => candidate.id === nodeId)
    if (!node || node.data.nodeType !== 'text') {
      return
    }
    withYDoc(context, (y) => {
      writeWorkflowTextNodeText(y.nodes, nodeId, text)
    }, { discrete: false })
  },
}
