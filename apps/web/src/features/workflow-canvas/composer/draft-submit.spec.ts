import type { NodeMediaSlotItem } from '@mina/contracts/modules/media'

import { baseMessages } from '../../../lib/i18n-messages'
import { useCanvasUiStore } from '../store/canvas-ui-store'
import { submitComposerDraft } from './draft-submit'

const draftTask = {
  kind: 'image_generation' as const,
  model: 'gemini-3.1-flash-image-preview',
  params: { aspectRatio: '1:1', count: 1, imageSize: '1K' },
  prompt: 'Create a mountain lake',
  provider: 'google',
}

const mediaObjectItem: NodeMediaSlotItem = {
  id: 'draft_media_1',
  order: 0,
  required: true,
  slot: 'inputImages',
  source: { type: 'media_object', mediaObjectId: 'media_1' },
}

const resetUiStore = () => {
  useCanvasUiStore.setState({
    activeNodePanel: undefined,
    composerDraft: {
      expanded: false,
      mediaSlots: {},
      task: draftTask,
      uploads: {},
    },
    selectedNodeIds: [],
  })
}

resetUiStore()

const uploadBlockedCalls: string[] = []
await submitComposerDraft(
  {
    expanded: false,
    mediaSlots: {},
    task: draftTask,
    uploads: {
      upload_1: { slot: 'inputImages', status: 'uploading' },
    },
  },
  {
    addMediaGenerationNode: () => {
      uploadBlockedCalls.push('addMediaGenerationNode')
      return 'node_unexpected'
    },
    focusNode: () => uploadBlockedCalls.push('focusNode'),
    getNewNodePosition: () => ({ x: 10, y: 20 }),
    onRunNode: () => uploadBlockedCalls.push('onRunNode'),
    openNodePanel: () => uploadBlockedCalls.push('openNodePanel'),
    resetComposerDraft: () => uploadBlockedCalls.push('resetComposerDraft'),
    setDraftError: (error) => {
      if (error !== 'Uploading media') {
        throw new Error('Uploading draft submit should expose an upload error.')
      }
      uploadBlockedCalls.push('setDraftError')
    },
    setDraftExpanded: (expanded) => {
      if (!expanded) {
        throw new Error('Uploading draft submit should expand the composer.')
      }
      uploadBlockedCalls.push('setDraftExpanded')
    },
  },
  baseMessages,
)

if (uploadBlockedCalls.join(',') !== 'setDraftExpanded,setDraftError') {
  throw new Error('Uploading draft submit should not create, select, or run a node.')
}

resetUiStore()

const successfulCalls: string[] = []
let createdInput:
  | Parameters<Parameters<typeof submitComposerDraft>[1]['addMediaGenerationNode']>[0]
  | undefined

await submitComposerDraft(
  {
    expanded: true,
    mediaSlots: { inputImages: [mediaObjectItem] },
    task: draftTask,
    uploads: {},
  },
  {
    addMediaGenerationNode: (input) => {
      successfulCalls.push('addMediaGenerationNode')
      createdInput = input
      return 'node_created'
    },
    focusNode: (nodeId) => {
      if (nodeId !== 'node_created') {
        throw new Error('Draft submit should focus the created node.')
      }
      successfulCalls.push('focusNode')
    },
    getNewNodePosition: (nodeType) => {
      if (nodeType !== 'image_generation') {
        throw new Error('Draft submit should position by the draft node type.')
      }
      successfulCalls.push('getNewNodePosition')
      return { x: 10, y: 20 }
    },
    onRunNode: (nodeId) => {
      if (nodeId !== 'node_created') {
        throw new Error('Draft submit should run the created node.')
      }
      successfulCalls.push('onRunNode')
    },
    openNodePanel: (nodeId, panel) => {
      if (nodeId !== 'node_created' || panel !== 'config') {
        throw new Error('Draft submit should open the created node config panel.')
      }
      successfulCalls.push('openNodePanel')
    },
    resetComposerDraft: () => successfulCalls.push('resetComposerDraft'),
    setDraftError: () => successfulCalls.push('setDraftError'),
    setDraftExpanded: () => successfulCalls.push('setDraftExpanded'),
  },
  baseMessages,
)

if (!createdInput) {
  throw new Error('Draft submit should create a media generation node.')
}
if (createdInput.nodeType !== 'image_generation' || createdInput.task.prompt !== draftTask.prompt) {
  throw new Error('Draft submit should create the node from the draft task.')
}
if (createdInput.mediaSlots?.inputImages?.[0]?.source.type !== 'media_object') {
  throw new Error('Draft submit should pass draft media_object slots into the new node.')
}
if (createdInput.position?.x !== 10 || createdInput.position.y !== 20) {
  throw new Error('Draft submit should pass the viewport-derived position.')
}
if (useCanvasUiStore.getState().selectedNodeIds[0] !== 'node_created') {
  throw new Error('Draft submit should select the created node.')
}
if (successfulCalls.join(',') !== 'getNewNodePosition,addMediaGenerationNode,openNodePanel,resetComposerDraft,focusNode,onRunNode') {
  throw new Error('Draft submit should create, select, open, reset, focus, and run in order.')
}

resetUiStore()

const failedCalls: string[] = []
await submitComposerDraft(
  {
    expanded: false,
    mediaSlots: { inputImages: [mediaObjectItem] },
    task: draftTask,
    uploads: {},
  },
  {
    addMediaGenerationNode: () => {
      failedCalls.push('addMediaGenerationNode')
      throw new Error('graph invalid')
    },
    focusNode: () => failedCalls.push('focusNode'),
    getNewNodePosition: () => {
      failedCalls.push('getNewNodePosition')
      return { x: 10, y: 20 }
    },
    onRunNode: () => failedCalls.push('onRunNode'),
    openNodePanel: () => failedCalls.push('openNodePanel'),
    resetComposerDraft: () => failedCalls.push('resetComposerDraft'),
    setDraftError: (error) => {
      if (error !== 'graph invalid') {
        throw new Error('Failed draft submit should expose the graph error.')
      }
      failedCalls.push('setDraftError')
    },
    setDraftExpanded: (expanded) => {
      if (!expanded) {
        throw new Error('Failed draft submit should expand the composer.')
      }
      failedCalls.push('setDraftExpanded')
    },
  },
  baseMessages,
)

if (useCanvasUiStore.getState().selectedNodeIds.length !== 0) {
  throw new Error('Failed draft submit should not select a node.')
}
if (failedCalls.join(',') !== 'getNewNodePosition,addMediaGenerationNode,setDraftExpanded,setDraftError') {
  throw new Error('Failed draft submit should not open, reset, focus, or run a node.')
}

console.log('draft submit checks passed')
