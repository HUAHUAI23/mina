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
  fixture: { edges: ReturnType<typeof createCanvasPerformanceFixture>['edges']; nodes: ReturnType<typeof createCanvasPerformanceFixture>['nodes'] },
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

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message)
  }
}

const fixture = createCanvasPerformanceFixture(3)

withRegisteredRuntime('workflow_undo_origin_spec', fixture, (y) => {
  y.ydoc.transact(() => {
    y.meta.set('remote-only', true)
  }, 'remote-test')
  assert(!workflowUndoCommands.canUndo('workflow_undo_origin_spec'), 'Remote-origin transactions should not enter the local undo stack.')

  workflowYjsCommands.addNode(snapshotContext('workflow_undo_origin_spec', y), 'text')
  assert(workflowUndoCommands.canUndo('workflow_undo_origin_spec'), 'Local command transactions should enter the undo stack.')
})

withRegisteredRuntime('workflow_undo_add_node_spec', { edges: [], nodes: [] }, (y) => {
  const nodeId = workflowYjsCommands.addMediaGenerationNode(snapshotContext('workflow_undo_add_node_spec', y), {
    nodeType: 'image_generation',
    task,
  })
  assert(exportWorkflowSnapshotFromYjs(y).nodes.some((node) => node.id === nodeId), 'Added node should exist before undo.')

  workflowUndoCommands.undo('workflow_undo_add_node_spec')
  assert(!exportWorkflowSnapshotFromYjs(y).nodes.some((node) => node.id === nodeId), 'Undo should remove the added node.')
  assert(workflowUndoCommands.canRedo('workflow_undo_add_node_spec'), 'Undo should create a redo step.')

  workflowUndoCommands.redo('workflow_undo_add_node_spec')
  assert(exportWorkflowSnapshotFromYjs(y).nodes.some((node) => node.id === nodeId), 'Redo should restore the added node.')
})

withRegisteredRuntime('workflow_undo_delete_node_spec', fixture, (y) => {
  const before = exportWorkflowSnapshotFromYjs(y)
  const removedNodeId = 'perf_node_0'
  assert(before.edges.some((edge) => edge.source === removedNodeId || edge.target === removedNodeId), 'Fixture should contain an edge for node deletion.')

  workflowYjsCommands.removeGraphNodes(snapshotContext('workflow_undo_delete_node_spec', y), [removedNodeId])
  const afterDelete = exportWorkflowSnapshotFromYjs(y)
  assert(!afterDelete.nodes.some((node) => node.id === removedNodeId), 'Node deletion should remove the target node.')
  assert(!afterDelete.edges.some((edge) => edge.source === removedNodeId || edge.target === removedNodeId), 'Node deletion should remove incident edges.')

  workflowUndoCommands.undo('workflow_undo_delete_node_spec')
  const afterUndo = exportWorkflowSnapshotFromYjs(y)
  assert(afterUndo.nodes.some((node) => node.id === removedNodeId), 'Undo should restore deleted node.')
  assert(afterUndo.edges.some((edge) => edge.source === removedNodeId || edge.target === removedNodeId), 'Undo should restore deleted incident edge.')

  const restoredTarget = afterUndo.nodes.find((node) => node.id === 'perf_node_1')
  assert(
    restoredTarget?.data.nodeType === 'image_generation' &&
      restoredTarget.data.mediaSlots?.inputImages?.some((item) => item.source.type === 'node_output' && item.source.nodeId === removedNodeId),
    'Undo should restore media slot state associated with the incident edge.',
  )
})

withRegisteredRuntime('workflow_undo_capture_boundary_spec', { edges: [], nodes: [] }, (y) => {
  const firstNodeId = workflowYjsCommands.addNode(snapshotContext('workflow_undo_capture_boundary_spec', y), 'text')
  const secondNodeId = workflowYjsCommands.addNode(snapshotContext('workflow_undo_capture_boundary_spec', y), 'text')

  workflowUndoCommands.undo('workflow_undo_capture_boundary_spec')
  const afterFirstUndo = exportWorkflowSnapshotFromYjs(y)
  assert(afterFirstUndo.nodes.some((node) => node.id === firstNodeId), 'First structural command should remain after undoing the second command.')
  assert(!afterFirstUndo.nodes.some((node) => node.id === secondNodeId), 'First undo should revert only the second structural command.')

  workflowUndoCommands.undo('workflow_undo_capture_boundary_spec')
  assert(!exportWorkflowSnapshotFromYjs(y).nodes.some((node) => node.id === firstNodeId), 'Second undo should revert the first structural command.')
})

withRegisteredRuntime('workflow_undo_text_merge_spec', { edges: [], nodes: [] }, (y) => {
  const textNodeId = workflowYjsCommands.addNode(snapshotContext('workflow_undo_text_merge_spec', y), 'text')
  workflowYjsCommands.setNodeText(snapshotContext('workflow_undo_text_merge_spec', y), textNodeId, 'a')
  workflowYjsCommands.setNodeText(snapshotContext('workflow_undo_text_merge_spec', y), textNodeId, 'ab')
  workflowYjsCommands.setNodeText(snapshotContext('workflow_undo_text_merge_spec', y), textNodeId, 'abc')

  workflowUndoCommands.undo('workflow_undo_text_merge_spec')
  const afterUndo = exportWorkflowSnapshotFromYjs(y).nodes.find((node) => node.id === textNodeId)
  assert(afterUndo?.data.nodeType === 'text' && afterUndo.data.config.text === '', 'Consecutive text edits should merge into one undo step.')
  assert(workflowUndoCommands.canUndo('workflow_undo_text_merge_spec'), 'Text undo should not consume the structural add-node stack item.')
})

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
  assert(
    afterUndo?.data.nodeType === 'image_generation' &&
      afterUndo.data.config.task?.prompt === task.prompt &&
      afterUndo.data.config.task.model === task.model &&
      afterUndo.data.config.task.provider === task.provider &&
      JSON.stringify(afterUndo.data.config.task.params) === JSON.stringify(task.params),
    'Consecutive prompt edits should merge into one text-only undo step without changing the rest of the task config.',
  )
  assert(workflowUndoCommands.canUndo('workflow_undo_prompt_merge_spec'), 'Prompt undo should not consume the structural add-node stack item.')
})

{
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
    assert(node?.position.x === 200 && node.position.y === 200, 'Undo should not overwrite a newer remote Y.Map value.')
  } finally {
    unregisterWorkflowYjsRuntime(workflowId, local)
    local.ydoc.destroy()
    remote.ydoc.destroy()
  }
}

{
  const workflowId = 'workflow_undo_runtime_cleanup_spec'
  const y = createWorkflowYDoc()
  const empty = { edges: [], nodes: [] }
  let changeCount = 0
  const unsubscribe = subscribeWorkflowYjsRuntime(workflowId, () => {
    changeCount += 1
  })

  registerWorkflowYjsRuntime(workflowId, y, empty)
  assert(Boolean(getWorkflowYjsRuntimeForWorkflow(workflowId)), 'Runtime should be registered.')
  unregisterWorkflowYjsRuntime(workflowId, y)
  assert(!getWorkflowYjsRuntimeForWorkflow(workflowId), 'Runtime should be removed after unregister.')
  assert(changeCount === 2, 'Runtime subscribers should be notified on register and unregister.')
  unsubscribe()
  y.ydoc.destroy()
}

console.log('workflow undo command checks passed')
