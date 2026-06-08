import { test } from 'bun:test'
import type { NodeMediaSlotItem } from '@mina/contracts/modules/media'
import { Position } from '@xyflow/react'

import { selectWorkflowCanvasNodes } from './canvas-selection-actions'
import { useCanvasStore } from './canvas-store'
import { useCanvasUiStore } from './canvas-ui-store'
import { createCanvasPerformanceFixture } from '../utils/performance-fixture'

const defaultTask = {
  kind: 'image_generation' as const,
  model: 'gemini-3.1-flash-image-preview',
  params: { aspectRatio: '1:1', count: 1, imageSize: '1K' },
  prompt: 'Describe the image',
  provider: 'google',
}

const mediaObjectItem: NodeMediaSlotItem = {
  id: 'uploaded_media',
  order: 0,
  required: true,
  slot: 'inputImages',
  source: { type: 'media_object', mediaObjectId: 'media_uploaded' },
}

test('canvas ui store handles panels, add menu, and draft composer state', () => {
  useCanvasUiStore.setState({
    activeNodePanel: undefined,
    addMenu: undefined,
    composerDraft: {
      expanded: false,
      mediaSlots: {},
      task: defaultTask,
      uploads: {},
    },
    selectedNodeIds: [],
  })

useCanvasUiStore.getState().openNodePanel('node_1', 'config')
useCanvasUiStore.getState().selectNodeIds([])

if (useCanvasUiStore.getState().activeNodePanel) {
  throw new Error('Clearing selection should close the active config panel.')
}

useCanvasUiStore.getState().openNodePanel('node_1', 'config')
useCanvasUiStore.getState().selectNodeIds(['node_1', 'node_2'])
if (useCanvasUiStore.getState().activeNodePanel) {
  throw new Error('Multi-selection should close the active config panel.')
}

useCanvasUiStore.getState().openNodePanel('node_1', 'config')
useCanvasUiStore.getState().selectNodeIds(['node_1'])
if (useCanvasUiStore.getState().activeNodePanel?.nodeId !== 'node_1') {
  throw new Error('Selecting the active node should keep its config panel open.')
}

useCanvasUiStore.getState().openAddMenu({
  containerSize: { height: 600, width: 800 },
  flowPosition: { x: 120, y: 160 },
  scope: { scope: 'root' },
  screenPosition: { x: 220, y: 260 },
  trigger: 'canvas',
})
if (useCanvasUiStore.getState().activeNodePanel) {
  throw new Error('Opening the canvas add menu should close the active config panel.')
}
if (useCanvasUiStore.getState().addMenu?.trigger !== 'canvas') {
  throw new Error('openAddMenu should store the current add menu state.')
}
useCanvasUiStore.getState().openNodePanel('node_1', 'config')
if (useCanvasUiStore.getState().addMenu) {
  throw new Error('Opening a config panel should close the canvas add menu.')
}
useCanvasUiStore.getState().openAddMenu({
  containerSize: { height: 600, width: 800 },
  flowPosition: { x: 120, y: 160 },
  scope: { scope: 'root' },
  screenPosition: { x: 220, y: 260 },
  sourceId: 'node_1',
  trigger: 'connection',
}, {
  sourcePosition: Position.Right,
  sourceX: 120,
  sourceY: 160,
  targetPosition: Position.Left,
  targetX: 220,
  targetY: 260,
})
if (!useCanvasUiStore.getState().addMenuPreviewLine) {
  throw new Error('openAddMenu should store the optional menu preview line.')
}
useCanvasUiStore.getState().closeAddMenu()
if (useCanvasUiStore.getState().addMenu) {
  throw new Error('closeAddMenu should clear add menu state.')
}
if (useCanvasUiStore.getState().addMenuPreviewLine) {
  throw new Error('closeAddMenu should clear add menu preview line state.')
}

useCanvasUiStore.getState().closeNodePanel()

if (useCanvasUiStore.getState().activeNodePanel) {
  throw new Error('Explicit close should close the active config panel.')
}

useCanvasUiStore.getState().setComposerAdvancedOpen('node:node_1', true)
useCanvasUiStore.getState().setComposerSelectedSlot('node:node_1', 'lastFrame')
useCanvasUiStore.getState().setComposerSelectedSlot('node:node_2', 'referenceImages')

if (!useCanvasUiStore.getState().advancedOpenByComposerId['node:node_1']) {
  throw new Error('Advanced config state should persist by composer id.')
}
if (
  useCanvasUiStore.getState().selectedSlotByComposerId['node:node_1'] !== 'lastFrame' ||
  useCanvasUiStore.getState().selectedSlotByComposerId['node:node_2'] !== 'referenceImages'
) {
  throw new Error('Selected media slot state should be isolated by composer id.')
}

const fixture = createCanvasPerformanceFixture(3)
const firstNode = fixture.nodes[1]

if (!firstNode || firstNode.data.nodeType !== 'image_generation') {
  throw new Error('Expected first fixture node to be an image generation node.')
}

if (firstNode.data.mediaSlots?.inputImages?.[0]?.source.type !== 'node_output') {
  throw new Error('Fixture should cover node_output media slots.')
}

useCanvasStore.setState({
  edges: fixture.edges,
  name: 'Canvas UI draft spec',
  nodeIndexById: Object.fromEntries(fixture.nodes.map((node, index) => [node.id, index])),
  nodes: fixture.nodes,
  workflowId: 'canvas_ui_store_spec',
})

useCanvasUiStore.getState().setDraftTask({
  ...defaultTask,
  prompt: 'make it fluffy',
})
useCanvasUiStore.getState().setDraftMediaSlots({ inputImages: [mediaObjectItem] })

selectWorkflowCanvasNodes([firstNode.id])
selectWorkflowCanvasNodes([])

const draftAfterDeselect = useCanvasUiStore.getState().composerDraft
if (draftAfterDeselect.task.prompt !== firstNode.data.config.task?.prompt) {
  throw new Error('Deselecting a media node should snapshot its latest stored task into the composer draft.')
}
if (Object.keys(draftAfterDeselect.mediaSlots).length !== 0) {
  throw new Error('Deselecting a media node should clear draft media slots, including node_output and media_object sources.')
}
if (draftAfterDeselect.task.prompt === 'make it fluffy') {
  throw new Error('Deselecting should replace the draft as a one-shot snapshot instead of merging user draft content.')
}

useCanvasUiStore.getState().setDraftMediaSlots({ inputImages: [mediaObjectItem] })
if (useCanvasUiStore.getState().composerDraft.mediaSlots.inputImages?.[0]?.source.type !== 'media_object') {
  throw new Error('Draft media slot writes should preserve media_object uploads.')
}

useCanvasUiStore.getState().setDraftTask({
  kind: 'video_generation',
  model: 'veo-3.1-generate-preview',
  params: { aspectRatio: '16:9', durationSeconds: 8, personGeneration: 'allow_all', resolution: '720p' },
  prompt: 'Keep this prompt',
  provider: 'google',
})
const draftAfterKindSwitch = useCanvasUiStore.getState().composerDraft
if (draftAfterKindSwitch.task.prompt !== 'Keep this prompt' || draftAfterKindSwitch.mediaSlots.inputImages?.length) {
  throw new Error('Switching draft kind should preserve task text and trim incompatible media slots.')
}

useCanvasUiStore.getState().beginDraftUpload('upload_1', 'inputImages')
if (useCanvasUiStore.getState().composerDraft.uploads.upload_1?.status !== 'uploading') {
  throw new Error('beginDraftUpload should record upload progress.')
}

useCanvasUiStore.getState().failDraftUpload('missing_upload', 'Missing upload')
const draftAfterUnknownUploadFailure = useCanvasUiStore.getState().composerDraft
if (draftAfterUnknownUploadFailure.error !== 'Missing upload' || draftAfterUnknownUploadFailure.uploads.missing_upload) {
  throw new Error('failDraftUpload should not invent an upload slot when the upload id is unknown.')
}

useCanvasUiStore.getState().completeDraftUpload('upload_1')
if (useCanvasUiStore.getState().composerDraft.uploads.upload_1) {
  throw new Error('Completing an upload without an item should still clear the upload entry.')
}

useCanvasUiStore.getState().setDraftTask(defaultTask)
useCanvasUiStore.getState().setDraftMediaSlots({ inputImages: [mediaObjectItem] })
useCanvasUiStore.getState().beginDraftUpload('upload_2', 'inputImages')
useCanvasUiStore.getState().completeDraftUpload('upload_2', {
  ...mediaObjectItem,
  id: 'uploaded_media_2',
  source: { type: 'media_object', mediaObjectId: 'media_uploaded_2' },
})
const draftAfterUpload = useCanvasUiStore.getState().composerDraft
if (draftAfterUpload.uploads.upload_2 || draftAfterUpload.mediaSlots.inputImages?.length !== 2) {
  throw new Error('completeDraftUpload should remove the upload entry and append media_object slot items.')
}

useCanvasUiStore.getState().setDraftExpanded(true)
selectWorkflowCanvasNodes([])

  if (useCanvasUiStore.getState().composerDraft.expanded) {
    throw new Error('Clicking the canvas with no selected node should collapse the draft composer.')
  }
})
