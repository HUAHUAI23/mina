import { expect, test } from 'bun:test'

import { getWorkflowNodeBounds } from '../../domain/canvas-node-geometry'
import { createCanvasPerformanceFixture } from '../../utils/performance-fixture'
import { workflowYjsCommands } from './workflow-yjs-commands'
import { registerWorkflowYjsRuntime, unregisterWorkflowYjsRuntime } from './workflow-yjs-store'
import { createWorkflowYDoc, importWorkflowSnapshotToYjs } from './yjs-document'
import { exportWorkflowYjsSnapshot } from './yjs-snapshot'

const createRegisteredRuntime = (workflowId: string, nodeCount: number) => {
  const fixture = createCanvasPerformanceFixture(nodeCount)
  const y = createWorkflowYDoc()

  importWorkflowSnapshotToYjs(y, fixture)
  registerWorkflowYjsRuntime(workflowId, y, fixture)

  return {
    fixture,
    snapshot: () => exportWorkflowYjsSnapshot(y),
    y,
    workflowId,
  }
}

const disposeRuntime = (runtime: ReturnType<typeof createRegisteredRuntime>) => {
  unregisterWorkflowYjsRuntime(runtime.workflowId, runtime.y)
  runtime.y.ydoc.destroy()
}

test('workflow yjs commands require a registered runtime', () => {
  expect(() =>
    workflowYjsCommands.addMediaGenerationNode(
      { edges: [], nodes: [], workflowId: 'workflow_without_runtime' },
      {
        nodeType: 'image_generation',
        task: {
          kind: 'image_generation',
          model: 'gemini-3.1-flash-image-preview',
          params: { aspectRatio: '1:1', count: 1, imageSize: '1K' },
          prompt: 'A missing runtime should not clear the draft',
          provider: 'google',
        },
      },
    ),
  ).toThrow('Yjs runtime not registered for workflow workflow_without_runtime')
})

test('media generation commands initialize compatible slots and preserve targeted updates', () => {
  const runtime = createRegisteredRuntime('workflow_yjs_media_commands_spec', 1)

  try {
    const task = {
      kind: 'video_generation' as const,
      model: 'veo-3.1-generate-preview',
      params: { aspectRatio: '16:9', durationSeconds: 8, personGeneration: 'allow_all', resolution: '720p' },
      prompt: 'A slow dolly shot',
      provider: 'google',
    }
    const nodeId = workflowYjsCommands.addMediaGenerationNode(
      { edges: runtime.fixture.edges, nodes: runtime.fixture.nodes, workflowId: runtime.workflowId },
      {
        mediaSlots: {
          firstFrame: [
            {
              id: 'draft_slot_1',
              order: 0,
              required: true,
              slot: 'firstFrame',
              source: { type: 'media_object', mediaObjectId: 'media_1' },
            },
          ],
          inputImages: [
            {
              id: 'incompatible_slot',
              order: 0,
              required: true,
              slot: 'inputImages',
              source: { type: 'media_object', mediaObjectId: 'media_2' },
            },
          ],
        },
        nodeType: 'video_generation',
        task,
      },
    )

    const created = runtime.snapshot().nodes.find((node) => node.id === nodeId)
    expect(created?.data.nodeType).toBe('video_generation')
    if (created?.data.nodeType === 'video_generation') {
      expect(created.data.config.task?.prompt).toBe(task.prompt)
      expect(created.data.mediaSlots?.firstFrame?.[0]?.source.type).toBe('media_object')
      expect(created.data.mediaSlots?.inputImages?.length ?? 0).toBe(0)
    }

    const seededSnapshot = runtime.snapshot()
    workflowYjsCommands.addSlotItem(
      { edges: seededSnapshot.edges, nodes: seededSnapshot.nodes, workflowId: runtime.workflowId },
      nodeId,
      {
        id: 'unsupported_audio',
        order: 0,
        required: true,
        slot: 'referenceAudios',
        source: { type: 'media_object', mediaObjectId: 'media_audio' },
      },
    )
    const afterUnsupportedSlot = runtime.snapshot().nodes.find((node) => node.id === nodeId)
    if (afterUnsupportedSlot?.data.nodeType === 'video_generation') {
      expect(afterUnsupportedSlot.data.mediaSlots?.referenceAudios?.length ?? 0).toBe(0)
    }

    const promptContext = runtime.snapshot()
    const beforePromptUpdate = promptContext.nodes.find((node) => node.id === nodeId)
    expect(beforePromptUpdate?.data.nodeType).toBe('video_generation')
    workflowYjsCommands.setNodeTaskConfig(
      { edges: promptContext.edges, nodes: promptContext.nodes, workflowId: runtime.workflowId },
      nodeId,
      {
        ...task,
        prompt: 'A faster tracking shot',
      },
    )
    const afterPromptUpdate = runtime.snapshot().nodes.find((node) => node.id === nodeId)
    expect(afterPromptUpdate?.data.nodeType).toBe('video_generation')
    if (afterPromptUpdate?.data.nodeType === 'video_generation') {
      expect(afterPromptUpdate.data.config.task?.prompt).toBe('A faster tracking shot')
      expect(afterPromptUpdate.data.mediaSlots?.firstFrame?.[0]?.id).toBe('draft_slot_1')
    }
  } finally {
    disposeRuntime(runtime)
  }
})

test('group graph commands preserve React Flow parent semantics and group sizing', () => {
  const runtime = createRegisteredRuntime('workflow_yjs_group_commands_spec', 3)

  try {
    const groupId =
      workflowYjsCommands.groupGraphNodes(
        { edges: runtime.fixture.edges, nodes: runtime.fixture.nodes, workflowId: runtime.workflowId },
        ['perf_node_0', 'perf_node_1'],
        'flow_group',
      ) ?? 'missing_group'
    const grouped = runtime.snapshot()
    const group = grouped.nodes.find((node) => node.id === groupId)
    const groupedChild = grouped.nodes.find((node) => node.id === 'perf_node_1')

    expect(groupId).not.toBe('missing_group')
    expect(group?.data.nodeType).toBe('flow_group')
    expect({ height: group?.height, width: group?.width }).toEqual({ height: 376, width: 916 })
    expect(groupedChild?.parentId).toBe(groupId)
    expect(groupedChild?.extent).toBe('parent')

    const attachedIds = workflowYjsCommands.addNodesToGroup(
      { edges: grouped.edges, nodes: grouped.nodes, workflowId: runtime.workflowId },
      groupId,
      ['perf_node_2'],
      { absolutePositionsByNodeId: { perf_node_2: { x: 120, y: 120 } } },
    )
    const afterAttach = runtime.snapshot()
    const attachedNode = afterAttach.nodes.find((node) => node.id === 'perf_node_2')
    const groupAfterAttach = afterAttach.nodes.find((node) => node.id === groupId)

    expect(attachedIds).toEqual(['perf_node_2'])
    expect(attachedNode?.parentId).toBe(groupId)
    expect(attachedNode?.extent).toBe('parent')
    if (attachedNode && groupAfterAttach) {
      const attachedBounds = getWorkflowNodeBounds(attachedNode, attachedNode.position)
      expect(attachedBounds.left).toBeGreaterThanOrEqual(0)
      expect(attachedBounds.top).toBeGreaterThanOrEqual(0)
      expect(attachedBounds.right).toBeLessThanOrEqual(groupAfterAttach.width ?? 0)
      expect(attachedBounds.bottom).toBeLessThanOrEqual(groupAfterAttach.height ?? 0)
    }

    const scopedTextId = workflowYjsCommands.addNode(
      { edges: afterAttach.edges, nodes: afterAttach.nodes, workflowId: runtime.workflowId },
      'text',
      undefined,
      { parentId: groupId, position: { x: (groupAfterAttach?.position.x ?? 0) + 80, y: (groupAfterAttach?.position.y ?? 0) + 90 } },
    )
    const afterScopedText = runtime.snapshot()
    const scopedText = afterScopedText.nodes.find((node) => node.id === scopedTextId)
    expect(scopedText?.parentId).toBe(groupId)
    expect(scopedText?.extent).toBe('parent')
    expect(scopedText?.position.x ?? -1).toBeGreaterThanOrEqual(0)
    expect(scopedText?.position.y ?? -1).toBeGreaterThanOrEqual(0)

    const nestedGroupId = workflowYjsCommands.groupGraphNodes(
      { edges: afterScopedText.edges, nodes: afterScopedText.nodes, workflowId: runtime.workflowId },
      ['perf_node_2', scopedTextId],
      'node_group',
    )
    expect(nestedGroupId).toBeUndefined()

    const scopedImageId = workflowYjsCommands.addMediaGenerationNode(
      { edges: afterScopedText.edges, nodes: afterScopedText.nodes, workflowId: runtime.workflowId },
      {
        nodeType: 'image_generation',
        parentId: groupId,
        position: { x: (groupAfterAttach?.position.x ?? 0) + 1_820, y: (groupAfterAttach?.position.y ?? 0) + 1_240 },
        task: {
          kind: 'image_generation',
          model: 'gemini-3.1-flash-image-preview',
          params: { aspectRatio: '1:1', count: 1, imageSize: '1K' },
          prompt: 'Scoped image inside group',
          provider: 'google',
        },
      },
    )
    const afterScopedImage = runtime.snapshot()
    const scopedImage = afterScopedImage.nodes.find((node) => node.id === scopedImageId)
    const groupAfterScopedImage = afterScopedImage.nodes.find((node) => node.id === groupId)

    expect(scopedImage?.parentId).toBe(groupId)
    expect(scopedImage?.extent).toBe('parent')
    if (scopedImage && groupAfterScopedImage) {
      const scopedBounds = getWorkflowNodeBounds(scopedImage, scopedImage.position)
      expect(scopedBounds.right).toBeLessThanOrEqual(groupAfterScopedImage.width ?? 0)
      expect(scopedBounds.bottom).toBeLessThanOrEqual(groupAfterScopedImage.height ?? 0)
    }

    const groupBeforeChildMove = afterAttach.nodes.find((node) => node.id === groupId)
    workflowYjsCommands.commitNodeFrames(
      { edges: afterAttach.edges, nodes: afterAttach.nodes, workflowId: runtime.workflowId },
      [
        { nodeId: 'perf_node_2', position: { x: 1_160, y: 540 } },
        { nodeId: groupId, height: 868, width: 1_578 },
      ],
    )
    const afterChildMove = runtime.snapshot()
    const groupAfterChildMove = afterChildMove.nodes.find((node) => node.id === groupId)
    const movedChild = afterChildMove.nodes.find((node) => node.id === 'perf_node_2')

    expect(groupAfterChildMove?.width ?? 0).toBeGreaterThan(groupBeforeChildMove?.width ?? 0)
    expect(groupAfterChildMove?.height ?? 0).toBeGreaterThan(groupBeforeChildMove?.height ?? 0)
    if (movedChild && groupAfterChildMove) {
      const movedBounds = getWorkflowNodeBounds(movedChild, movedChild.position)
      expect(movedBounds.left).toBeGreaterThanOrEqual(0)
      expect(movedBounds.top).toBeGreaterThanOrEqual(0)
      expect(movedBounds.right).toBeLessThanOrEqual(groupAfterChildMove.width ?? 0)
      expect(movedBounds.bottom).toBeLessThanOrEqual(groupAfterChildMove.height ?? 0)
    }

    workflowYjsCommands.commitNodeFrames(
      { edges: afterChildMove.edges, nodes: afterChildMove.nodes, workflowId: runtime.workflowId },
      [{ nodeId: 'perf_node_2', position: { x: 0, y: 0 } }],
    )
    const afterTopLeftMove = runtime.snapshot()
    const groupAfterTopLeftMove = afterTopLeftMove.nodes.find((node) => node.id === groupId)
    const topLeftMovedChild = afterTopLeftMove.nodes.find((node) => node.id === 'perf_node_2')

    if (topLeftMovedChild) {
      const topLeftBounds = getWorkflowNodeBounds(topLeftMovedChild, topLeftMovedChild.position)
      expect(topLeftBounds.left).toBeGreaterThanOrEqual(0)
      expect(topLeftBounds.top).toBeGreaterThanOrEqual(0)
    }
    expect((groupAfterTopLeftMove?.position.x ?? 0) + (groupAfterTopLeftMove?.width ?? 0)).toBeGreaterThanOrEqual(
      (groupAfterChildMove?.position.x ?? 0) + (groupAfterChildMove?.width ?? 0),
    )
    expect((groupAfterTopLeftMove?.position.y ?? 0) + (groupAfterTopLeftMove?.height ?? 0)).toBeGreaterThanOrEqual(
      (groupAfterChildMove?.position.y ?? 0) + (groupAfterChildMove?.height ?? 0),
    )

    workflowYjsCommands.convertGroupNodeType(
      { edges: afterTopLeftMove.edges, nodes: afterTopLeftMove.nodes, workflowId: runtime.workflowId },
      groupId,
      'node_group',
    )
    const downgraded = runtime.snapshot()
    const downgradedGroup = downgraded.nodes.find((node) => node.id === groupId)
    const downgradedChild = downgraded.nodes.find((node) => node.id === 'perf_node_1')
    expect(downgradedGroup?.data.nodeType).toBe('node_group')
    if (
      downgradedChild?.data.nodeType === 'image_generation' &&
      downgradedChild.data.mediaSlots?.inputImages?.[0]?.source.type === 'node_output'
    ) {
      expect(downgradedChild.data.mediaSlots.inputImages[0].source.resolve).toBe('current_media')
    }

    workflowYjsCommands.convertGroupNodeType(
      { edges: downgraded.edges, nodes: downgraded.nodes, workflowId: runtime.workflowId },
      groupId,
      'flow_group',
    )
    const upgraded = runtime.snapshot()
    const upgradedChild = upgraded.nodes.find((node) => node.id === 'perf_node_1')
    if (
      upgradedChild?.data.nodeType === 'image_generation' &&
      upgradedChild.data.mediaSlots?.inputImages?.[0]?.source.type === 'node_output'
    ) {
      const source = upgradedChild.data.mediaSlots.inputImages[0].source
      expect(source.resolve).toBe('run_output')
      if (source.resolve === 'run_output') {
        expect(source.selector).toBeDefined()
      }
    }

    workflowYjsCommands.ungroupGraphNode(
      { edges: upgraded.edges, nodes: upgraded.nodes, workflowId: runtime.workflowId },
      groupId,
    )
    const ungrouped = runtime.snapshot()
    expect(ungrouped.nodes.some((node) => node.id === groupId)).toBe(false)
    expect(ungrouped.nodes.some((node) => node.parentId === groupId)).toBe(false)

    const deleteGroupId =
      workflowYjsCommands.groupGraphNodes(
        { edges: ungrouped.edges, nodes: ungrouped.nodes, workflowId: runtime.workflowId },
        ['perf_node_0', 'perf_node_1'],
        'node_group',
      ) ?? 'missing_delete_group'
    expect(deleteGroupId).not.toBe('missing_delete_group')
    const beforeDelete = runtime.snapshot()
    workflowYjsCommands.removeGraphNodes(
      { edges: beforeDelete.edges, nodes: beforeDelete.nodes, workflowId: runtime.workflowId },
      [deleteGroupId],
    )
    const afterDelete = runtime.snapshot()
    expect(afterDelete.nodes.some((node) => node.id === deleteGroupId)).toBe(false)
    expect(afterDelete.nodes.some((node) => node.parentId === deleteGroupId)).toBe(false)
    expect(afterDelete.nodes.some((node) => node.id === 'perf_node_0')).toBe(true)
    expect(afterDelete.nodes.some((node) => node.id === 'perf_node_1')).toBe(true)

    const resizeGroupId =
      workflowYjsCommands.groupGraphNodes(
        { edges: afterDelete.edges, nodes: afterDelete.nodes, workflowId: runtime.workflowId },
        ['perf_node_0', 'perf_node_1'],
        'node_group',
      ) ?? 'missing_resize_group'
    expect(resizeGroupId).not.toBe('missing_resize_group')
    const beforeResize = runtime.snapshot()
    workflowYjsCommands.commitNodeFrames(
      { edges: beforeResize.edges, nodes: beforeResize.nodes, workflowId: runtime.workflowId },
      [{ height: 820, nodeId: resizeGroupId, width: 1_420 }],
    )
    const afterResize = runtime.snapshot()
    const resizeGroupAfter = afterResize.nodes.find((node) => node.id === resizeGroupId)
    expect(resizeGroupAfter?.width ?? 0).toBeGreaterThanOrEqual(1_420)
    expect(resizeGroupAfter?.height ?? 0).toBeGreaterThanOrEqual(820)

    workflowYjsCommands.detachGraphNodes(
      { edges: afterResize.edges, nodes: afterResize.nodes, workflowId: runtime.workflowId },
      ['perf_node_1'],
    )
    const afterDetach = runtime.snapshot()
    const resizeGroupAfterDetach = afterDetach.nodes.find((node) => node.id === resizeGroupId)
    expect(resizeGroupAfterDetach?.width).toBe(resizeGroupAfter?.width)
    expect(resizeGroupAfterDetach?.height).toBe(resizeGroupAfter?.height)

    workflowYjsCommands.fitGroupNodeToChildren(
      { edges: afterDetach.edges, nodes: afterDetach.nodes, workflowId: runtime.workflowId },
      resizeGroupId,
    )
    const afterManualFit = runtime.snapshot()
    const fitGroupAfterManualFit = afterManualFit.nodes.find((node) => node.id === resizeGroupId)
    const remainingChild = afterManualFit.nodes.find((node) => node.id === 'perf_node_0')
    expect(fitGroupAfterManualFit?.width ?? Number.POSITIVE_INFINITY).toBeLessThan(resizeGroupAfterDetach?.width ?? 0)
    if (remainingChild && fitGroupAfterManualFit) {
      const remainingBounds = getWorkflowNodeBounds(remainingChild, remainingChild.position)
      expect(remainingBounds.left).toBeGreaterThanOrEqual(0)
      expect(remainingBounds.top).toBeGreaterThanOrEqual(0)
      expect(remainingBounds.right).toBeLessThanOrEqual(fitGroupAfterManualFit.width ?? 0)
      expect(remainingBounds.bottom).toBeLessThanOrEqual(fitGroupAfterManualFit.height ?? 0)
    }
  } finally {
    disposeRuntime(runtime)
  }
})

test('connected media generation commands create node, slot, and edge in one transaction', () => {
  const runtime = createRegisteredRuntime('workflow_yjs_connected_node_spec', 2)

  try {
    const beforeConnect = runtime.snapshot()
    const connectedNodeId = workflowYjsCommands.addConnectedMediaGenerationNode(
      { edges: beforeConnect.edges, nodes: beforeConnect.nodes, workflowId: runtime.workflowId },
      {
        nodeType: 'image_generation',
        position: { x: 420, y: 180 },
        sourceId: 'perf_node_0',
        sourceHandle: 'source',
        task: {
          kind: 'image_generation',
          model: 'gemini-3.1-flash-image-preview',
          params: { aspectRatio: '1:1', count: 1, imageSize: '1K' },
          prompt: 'Connected from an open connection',
          provider: 'google',
        },
      },
    )
    expect(connectedNodeId).toBeDefined()

    const afterConnect = runtime.snapshot()
    const connectedNode = afterConnect.nodes.find((node) => node.id === connectedNodeId)
    expect(connectedNode?.data.nodeType).toBe('image_generation')
    if (connectedNode?.data.nodeType === 'image_generation') {
      expect(connectedNode.data.mediaSlots?.inputImages?.[0]?.source.type).toBe('node_output')
      if (connectedNode.data.mediaSlots?.inputImages?.[0]?.source.type === 'node_output') {
        expect(connectedNode.data.mediaSlots.inputImages[0].source.nodeId).toBe('perf_node_0')
      }
    }
    expect(afterConnect.edges.some((edge) => edge.source === 'perf_node_0' && edge.target === connectedNodeId)).toBe(true)
  } finally {
    disposeRuntime(runtime)
  }
})
