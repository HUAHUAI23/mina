import { expect, test } from 'bun:test'
import * as Y from 'yjs'

import { createCanvasPerformanceFixture } from '../../utils/performance-fixture'
import { createWorkflowYDoc, exportWorkflowSnapshotFromYjs, importWorkflowSnapshotToYjs } from './yjs-document'
import { workflowUndoCommands } from './workflow-undo-commands'
import { workflowYjsCommands, type WorkflowYjsCommandContext } from './workflow-yjs-commands'
import {
  getWorkflowYjsRuntimeForWorkflow,
  registerWorkflowYjsRuntime,
  subscribeWorkflowYjsRuntime,
  unregisterWorkflowYjsRuntime,
} from './workflow-yjs-store'

const task = {
  kind: 'image_generation' as const,
  model: 'gemini-3.1-flash-image-preview',
  params: { aspectRatio: '1:1', count: 1, imageSize: '1K' },
  prompt: 'Undo test prompt',
  provider: 'google',
}

const snapshotContext = (workflowId: string, y: ReturnType<typeof createWorkflowYDoc>): WorkflowYjsCommandContext => {
  const snapshot = exportWorkflowSnapshotFromYjs(y)
  return { edges: snapshot.edges, nodes: snapshot.nodes, workflowId }
}

const withRegisteredRuntime = (
  workflowId: string,
  fixture: {
    edges: ReturnType<typeof createCanvasPerformanceFixture>['edges']
    nodes: ReturnType<typeof createCanvasPerformanceFixture>['nodes']
  },
  run: (y: ReturnType<typeof createWorkflowYDoc>) => void,
): void => {
  const y = createWorkflowYDoc()
  importWorkflowSnapshotToYjs(y, fixture)
  registerWorkflowYjsRuntime(workflowId, y, fixture)
  try {
    run(y)
  } finally {
    unregisterWorkflowYjsRuntime(workflowId, y)
    y.ydoc.destroy()
  }
}

const fixture = createCanvasPerformanceFixture(3)

test('workflow undo stack captures only local command transactions', () => {
  withRegisteredRuntime('workflow_undo_origin_spec', fixture, (y) => {
    y.ydoc.transact(() => {
      y.meta.set('remote-only', true)
    }, 'remote-test')
    expect(workflowUndoCommands.canUndo('workflow_undo_origin_spec')).toBe(false)

    workflowYjsCommands.addNode(snapshotContext('workflow_undo_origin_spec', y), 'text')
    expect(workflowUndoCommands.canUndo('workflow_undo_origin_spec')).toBe(true)
  })
})

test('workflow undo and redo restore added media generation nodes', () => {
  withRegisteredRuntime('workflow_undo_add_node_spec', { edges: [], nodes: [] }, (y) => {
    const nodeId = workflowYjsCommands.addMediaGenerationNode(snapshotContext('workflow_undo_add_node_spec', y), {
      nodeType: 'image_generation',
      task,
    })
    expect(exportWorkflowSnapshotFromYjs(y).nodes.some((node) => node.id === nodeId)).toBe(true)

    workflowUndoCommands.undo('workflow_undo_add_node_spec')
    expect(exportWorkflowSnapshotFromYjs(y).nodes.some((node) => node.id === nodeId)).toBe(false)
    expect(workflowUndoCommands.canRedo('workflow_undo_add_node_spec')).toBe(true)

    workflowUndoCommands.redo('workflow_undo_add_node_spec')
    expect(exportWorkflowSnapshotFromYjs(y).nodes.some((node) => node.id === nodeId)).toBe(true)
  })
})

test('workflow undo restores deleted nodes with incident edges and media slots', () => {
  withRegisteredRuntime('workflow_undo_delete_node_spec', fixture, (y) => {
    const before = exportWorkflowSnapshotFromYjs(y)
    const removedNodeId = 'perf_node_0'
    expect(before.edges.some((edge) => edge.source === removedNodeId || edge.target === removedNodeId)).toBe(true)

    workflowYjsCommands.removeGraphNodes(snapshotContext('workflow_undo_delete_node_spec', y), [removedNodeId])
    const afterDelete = exportWorkflowSnapshotFromYjs(y)
    expect(afterDelete.nodes.some((node) => node.id === removedNodeId)).toBe(false)
    expect(afterDelete.edges.some((edge) => edge.source === removedNodeId || edge.target === removedNodeId)).toBe(false)

    workflowUndoCommands.undo('workflow_undo_delete_node_spec')
    const afterUndo = exportWorkflowSnapshotFromYjs(y)
    expect(afterUndo.nodes.some((node) => node.id === removedNodeId)).toBe(true)
    expect(afterUndo.edges.some((edge) => edge.source === removedNodeId || edge.target === removedNodeId)).toBe(true)

    const restoredTarget = afterUndo.nodes.find((node) => node.id === 'perf_node_1')
    expect(
      restoredTarget?.data.nodeType === 'image_generation' &&
        restoredTarget.data.mediaSlots?.inputImages?.some((item) => item.source.type === 'node_output' && item.source.nodeId === removedNodeId),
    ).toBe(true)
  })
})

test('workflow undo respects structural command boundaries', () => {
  withRegisteredRuntime('workflow_undo_capture_boundary_spec', { edges: [], nodes: [] }, (y) => {
    const firstNodeId = workflowYjsCommands.addNode(snapshotContext('workflow_undo_capture_boundary_spec', y), 'text')
    const secondNodeId = workflowYjsCommands.addNode(snapshotContext('workflow_undo_capture_boundary_spec', y), 'text')

    workflowUndoCommands.undo('workflow_undo_capture_boundary_spec')
    const afterFirstUndo = exportWorkflowSnapshotFromYjs(y)
    expect(afterFirstUndo.nodes.some((node) => node.id === firstNodeId)).toBe(true)
    expect(afterFirstUndo.nodes.some((node) => node.id === secondNodeId)).toBe(false)

    workflowUndoCommands.undo('workflow_undo_capture_boundary_spec')
    expect(exportWorkflowSnapshotFromYjs(y).nodes.some((node) => node.id === firstNodeId)).toBe(false)
  })
})

test('workflow undo merges consecutive text edits into one undo step', () => {
  withRegisteredRuntime('workflow_undo_text_merge_spec', { edges: [], nodes: [] }, (y) => {
    const textNodeId = workflowYjsCommands.addNode(snapshotContext('workflow_undo_text_merge_spec', y), 'text')
    workflowYjsCommands.setNodeText(snapshotContext('workflow_undo_text_merge_spec', y), textNodeId, 'a')
    workflowYjsCommands.setNodeText(snapshotContext('workflow_undo_text_merge_spec', y), textNodeId, 'ab')
    workflowYjsCommands.setNodeText(snapshotContext('workflow_undo_text_merge_spec', y), textNodeId, 'abc')

    workflowUndoCommands.undo('workflow_undo_text_merge_spec')
    const afterUndo = exportWorkflowSnapshotFromYjs(y).nodes.find((node) => node.id === textNodeId)
    expect(afterUndo?.data.nodeType === 'text' && afterUndo.data.config.text === '').toBe(true)
    expect(workflowUndoCommands.canUndo('workflow_undo_text_merge_spec')).toBe(true)
  })
})

test('workflow undo merges consecutive prompt edits without changing other task config', () => {
  withRegisteredRuntime('workflow_undo_prompt_merge_spec', { edges: [], nodes: [] }, (y) => {
    const nodeId = workflowYjsCommands.addMediaGenerationNode(snapshotContext('workflow_undo_prompt_merge_spec', y), {
      nodeType: 'image_generation',
      task,
    })
    workflowYjsCommands.setNodeTaskPrompt(snapshotContext('workflow_undo_prompt_merge_spec', y), nodeId, 'first prompt')
    workflowYjsCommands.setNodeTaskPrompt(snapshotContext('workflow_undo_prompt_merge_spec', y), nodeId, 'second prompt')
    workflowYjsCommands.setNodeTaskPrompt(snapshotContext('workflow_undo_prompt_merge_spec', y), nodeId, 'third prompt')

    workflowUndoCommands.undo('workflow_undo_prompt_merge_spec')
    const afterUndo = exportWorkflowSnapshotFromYjs(y).nodes.find((node) => node.id === nodeId)
    expect(
      afterUndo?.data.nodeType === 'image_generation' &&
        afterUndo.data.config.task?.prompt === task.prompt &&
        afterUndo.data.config.task.model === task.model &&
        afterUndo.data.config.task.provider === task.provider &&
        JSON.stringify(afterUndo.data.config.task.params) === JSON.stringify(task.params),
    ).toBe(true)
    expect(workflowUndoCommands.canUndo('workflow_undo_prompt_merge_spec')).toBe(true)
  })
})

test('workflow undo does not overwrite newer remote Y.Map values', () => {
  const workflowId = 'workflow_undo_remote_map_spec'
  const local = createWorkflowYDoc()
  const remote = createWorkflowYDoc()
  const mapFixture = createCanvasPerformanceFixture(1)
  importWorkflowSnapshotToYjs(local, mapFixture)
  Y.applyUpdate(remote.ydoc, Y.encodeStateAsUpdate(local.ydoc))
  registerWorkflowYjsRuntime(workflowId, local, mapFixture)

  try {
    workflowYjsCommands.setNodeFrame(snapshotContext(workflowId, local), {
      nodeId: 'perf_node_0',
      position: { x: 100, y: 100 },
    })
    Y.applyUpdate(remote.ydoc, Y.encodeStateAsUpdate(local.ydoc))
    remote.ydoc.transact(() => {
      remote.nodeFrames.set('perf_node_0', { position: { x: 200, y: 200 } })
    }, 'remote-user')
    Y.applyUpdate(local.ydoc, Y.encodeStateAsUpdate(remote.ydoc))

    workflowUndoCommands.undo(workflowId)
    const node = exportWorkflowSnapshotFromYjs(local).nodes.find((candidate) => candidate.id === 'perf_node_0')
    expect(node?.position).toEqual({ x: 200, y: 200 })
  } finally {
    unregisterWorkflowYjsRuntime(workflowId, local)
    local.ydoc.destroy()
    remote.ydoc.destroy()
  }
})

test('workflow Yjs runtime unregister cleans up runtime and notifies subscribers', () => {
  const workflowId = 'workflow_undo_runtime_cleanup_spec'
  const y = createWorkflowYDoc()
  const empty = { edges: [], nodes: [] }
  let changeCount = 0
  const unsubscribe = subscribeWorkflowYjsRuntime(workflowId, () => {
    changeCount += 1
  })

  registerWorkflowYjsRuntime(workflowId, y, empty)
  expect(getWorkflowYjsRuntimeForWorkflow(workflowId)).toBeDefined()
  unregisterWorkflowYjsRuntime(workflowId, y)
  expect(getWorkflowYjsRuntimeForWorkflow(workflowId)).toBeUndefined()
  expect(changeCount).toBe(2)
  unsubscribe()
  y.ydoc.destroy()
})
