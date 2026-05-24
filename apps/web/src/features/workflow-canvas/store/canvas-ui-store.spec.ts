import type { NodeMediaSlotItem } from '@mina/contracts/modules/media'

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

useCanvasUiStore.setState({
  activeNodePanel: undefined,
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

if (useCanvasUiStore.getState().activeNodePanel?.nodeId !== 'node_1') {
  throw new Error('Selection changes should not close the active config panel.')
}

useCanvasUiStore.getState().closeNodePanel()

if (useCanvasUiStore.getState().activeNodePanel) {
  throw new Error('Explicit close should close the active config panel.')
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

console.log('canvas ui store checks passed')
