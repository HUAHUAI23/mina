import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import type { MediaSlotName, NodeMediaSlotItem } from '@mina/contracts/modules/media'
import type { MediaInput, NodeOutputResource } from '@mina/contracts/modules/tasks'
import type { WorkflowRunMode, WorkflowRunNodeState } from '@mina/contracts/modules/workflows'

import type { MediaObjectService } from '../../media/media-object.service'
import type { TasksService } from '../../tasks/tasks.service'
import { isMediaWorkflowNode } from '../graph'
import {
  findOutputByMediaView,
  findOutputBySelector,
  mediaInputWithSlotMetadata,
  slotToInputRole,
  slotToResourceKind,
} from './media-input-builder'
import { mediaSlotItemsForNode, SINGLE_MEDIA_SLOTS, sortedSlotItems } from './node-media-slots'

export interface ResolveWorkflowNodeMediaInput {
  edges: WorkflowCanvasEdge[]
  getSourceNode(nodeId: string): Promise<WorkflowCanvasNode | undefined>
  getSourceNodeState(nodeId: string): Promise<WorkflowRunNodeState | undefined>
  node: WorkflowCanvasNode
  run: {
    accountId: string
    id: string
    runMode: WorkflowRunMode
    workflowId: string
  }
}

export interface ResolvedWorkflowMediaInput {
  input: MediaInput
  slot: MediaSlotName
  slotItemId: string
  slotOrder: number
}

export class WorkflowMediaResolver {
  constructor(
    private readonly mediaObjectService: MediaObjectService,
    private readonly tasksService: TasksService,
  ) {}

  async resolveNodeMedia(input: ResolveWorkflowNodeMediaInput): Promise<ResolvedWorkflowMediaInput[]> {
    const itemsBySlot = this.itemsBySlot(input.node, input.edges)
    const resolved: ResolvedWorkflowMediaInput[] = []

    for (const [slot, items] of Object.entries(itemsBySlot) as Array<[MediaSlotName, NodeMediaSlotItem[]]>) {
      const sortedItems = sortedSlotItems(items)
      if (SINGLE_MEDIA_SLOTS.has(slot) && sortedItems.length > 1) {
        throw new Error(`Slot "${slot}" accepts at most one ready media item.`)
      }
      for (const item of sortedItems) {
        const mediaInput = await this.resolveSlotItem(input, item)
        if (!mediaInput) {
          continue
        }
        resolved.push({
          input: mediaInputWithSlotMetadata(mediaInput, item),
          slot,
          slotItemId: item.id,
          slotOrder: item.order,
        })
      }
    }

    return resolved.sort((left, right) => {
      const slotDiff = left.slot.localeCompare(right.slot)
      if (slotDiff !== 0) {
        return slotDiff
      }
      const orderDiff = left.slotOrder - right.slotOrder
      if (orderDiff !== 0) {
        return orderDiff
      }
      return left.slotItemId.localeCompare(right.slotItemId)
    })
  }

  private itemsBySlot(
    node: WorkflowCanvasNode,
    edges: WorkflowCanvasEdge[],
  ): Partial<Record<MediaSlotName, NodeMediaSlotItem[]>> {
    return mediaSlotItemsForNode(node, edges).reduce<Partial<Record<MediaSlotName, NodeMediaSlotItem[]>>>(
      (accumulator, item) => ({
        ...accumulator,
        [item.slot]: [...(accumulator[item.slot] ?? []), item],
      }),
      {},
    )
  }

  private async resolveSlotItem(
    input: ResolveWorkflowNodeMediaInput,
    item: NodeMediaSlotItem,
  ): Promise<MediaInput | null> {
    const expectedKind = slotToResourceKind(item.slot)
    const role = slotToInputRole(item.slot)

    if (item.source.type === 'media_object') {
      const mediaObjectId = item.source.mediaObjectId
      const mediaObject = await this.resolveRequired(item, () =>
        this.mediaObjectService.getReadyMediaObject(input.run.accountId, mediaObjectId),
      )
      if (!mediaObject) {
        return null
      }
      if (mediaObject.kind !== expectedKind) {
        throw new Error(`Media object kind "${mediaObject.kind}" cannot be used for slot "${item.slot}".`)
      }
      return {
        kind: mediaObject.kind,
        url: mediaObject.url,
        role,
        mediaObjectId: mediaObject.id,
        source: { type: 'media_object', mediaObjectId: mediaObject.id },
        ...(mediaObject.metadata ? { metadata: mediaObject.metadata } : {}),
      }
    }

    if (item.source.type === 'external_url') {
      if (item.source.kind !== expectedKind) {
        throw new Error(`External media kind "${item.source.kind}" cannot be used for slot "${item.slot}".`)
      }
      return {
        kind: item.source.kind,
        url: item.source.url,
        role,
        source: { type: 'external_url' },
        ...(item.source.metadata ? { metadata: item.source.metadata } : {}),
      }
    }

    if (item.source.resolve === 'current_media') {
      return this.resolveCurrentMedia(input, item, role, expectedKind)
    }

    return this.resolveRunOutput(input, item, role, expectedKind)
  }

  private async resolveCurrentMedia(
    input: ResolveWorkflowNodeMediaInput,
    item: NodeMediaSlotItem,
    role: MediaInput['role'],
    expectedKind: MediaInput['kind'],
  ): Promise<MediaInput | null> {
    if (item.source.type !== 'node_output' || item.source.resolve !== 'current_media') {
      throw new Error('Invalid current media source.')
    }

    const sourceNode = await input.getSourceNode(item.source.nodeId)
    if (!sourceNode || !isMediaWorkflowNode(sourceNode) || !sourceNode.data.mediaView?.taskId) {
      return this.handleMissing(item, 'Source node has no current MediaView output.')
    }

    const output = await this.tasksService.getTaskOutputForAccount(input.run.accountId, sourceNode.data.mediaView.taskId)
    const resource = output
      ? findOutputByMediaView(output, sourceNode.data.mediaView.outputResourceId, sourceNode.data.mediaView.outputIndex)
      : undefined
    if (!resource) {
      return this.handleMissing(item, 'Required upstream output is missing.')
    }
    this.assertOutputKind(item, resource, expectedKind)
    return {
      kind: resource.kind,
      url: resource.url,
      role,
      ...(resource.mediaObjectId ? { mediaObjectId: resource.mediaObjectId } : {}),
      source: {
        type: 'workflow_current_media',
        workflowId: input.run.workflowId,
        nodeId: item.source.nodeId,
        taskId: sourceNode.data.mediaView.taskId,
        ...(resource.id ? { outputResourceId: resource.id } : {}),
        ...(resource.index !== undefined ? { outputIndex: resource.index } : {}),
      },
      ...(resource.metadata ? { metadata: resource.metadata } : {}),
    }
  }

  private async resolveRunOutput(
    input: ResolveWorkflowNodeMediaInput,
    item: NodeMediaSlotItem,
    role: MediaInput['role'],
    expectedKind: MediaInput['kind'],
  ): Promise<MediaInput | null> {
    if (item.source.type !== 'node_output' || item.source.resolve !== 'run_output') {
      throw new Error('Invalid run output source.')
    }

    const sourceState = await input.getSourceNodeState(item.source.nodeId)
    if (sourceState?.status !== 'succeeded' || !sourceState.output) {
      return this.handleMissing(item, 'Source node has no succeeded output in this workflow run.')
    }
    const resource = findOutputBySelector(
      sourceState.output,
      item.source.selector.resourceKind,
      item.source.selector.role,
      item.source.selector.index,
    )
    if (!resource) {
      return this.handleMissing(item, 'Required workflow run output is missing.')
    }
    this.assertOutputKind(item, resource, expectedKind)
    return {
      kind: resource.kind,
      url: resource.url,
      role,
      ...(resource.mediaObjectId ? { mediaObjectId: resource.mediaObjectId } : {}),
      source: {
        type: 'workflow_run_output',
        workflowId: input.run.workflowId,
        workflowRunId: input.run.id,
        nodeId: item.source.nodeId,
        ...(sourceState.taskId ? { taskId: sourceState.taskId } : {}),
        ...(resource.id ? { outputResourceId: resource.id } : {}),
        ...(resource.index !== undefined ? { outputIndex: resource.index } : {}),
      },
      ...(resource.metadata ? { metadata: resource.metadata } : {}),
    }
  }

  private async resolveRequired<T>(item: NodeMediaSlotItem, resolve: () => Promise<T>): Promise<T | null> {
    try {
      return await resolve()
    } catch (error) {
      return this.handleMissing(item, error instanceof Error ? error.message : 'Required media is missing.')
    }
  }

  private handleMissing(item: NodeMediaSlotItem, message: string): null {
    if (!item.required) {
      return null
    }
    throw new Error(message)
  }

  private assertOutputKind(item: NodeMediaSlotItem, resource: NodeOutputResource, expectedKind: MediaInput['kind']): void {
    if (resource.kind !== expectedKind) {
      throw new Error(`Upstream output kind "${resource.kind}" cannot be used for slot "${item.slot}".`)
    }
  }
}
