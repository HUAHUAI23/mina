import { expect, test } from 'bun:test'
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

test('submitComposerDraft blocks submission while media uploads are in progress', async () => {
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
      openNodePanel: () => uploadBlockedCalls.push('openNodePanel'),
      resetComposerDraft: () => uploadBlockedCalls.push('resetComposerDraft'),
      setDraftError: (error) => {
        expect(error).toBe(baseMessages.workflow_canvas_error_uploading_media())
        uploadBlockedCalls.push('setDraftError')
      },
      setDraftExpanded: (expanded) => {
        expect(expanded).toBe(true)
        uploadBlockedCalls.push('setDraftExpanded')
      },
    },
    baseMessages,
  )

  expect(uploadBlockedCalls).toEqual(['setDraftExpanded', 'setDraftError'])
})

test('submitComposerDraft creates, selects, opens, resets, and focuses new media nodes in order', async () => {
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
        expect(nodeId).toBe('node_created')
        successfulCalls.push('focusNode')
      },
      getNewNodePosition: (nodeType) => {
        expect(nodeType).toBe('image_generation')
        successfulCalls.push('getNewNodePosition')
        return { x: 10, y: 20 }
      },
      openNodePanel: (nodeId, panel) => {
        expect(nodeId).toBe('node_created')
        expect(panel).toBe('config')
        successfulCalls.push('openNodePanel')
      },
      resetComposerDraft: () => successfulCalls.push('resetComposerDraft'),
      setDraftError: () => successfulCalls.push('setDraftError'),
      setDraftExpanded: () => successfulCalls.push('setDraftExpanded'),
    },
    baseMessages,
  )

  expect(createdInput).toBeDefined()
  expect(createdInput?.nodeType).toBe('image_generation')
  expect(createdInput?.task.prompt).toBe(draftTask.prompt)
  expect(createdInput?.mediaSlots?.inputImages?.[0]?.source.type).toBe('media_object')
  expect(createdInput?.position).toEqual({ x: 10, y: 20 })
  expect(useCanvasUiStore.getState().selectedNodeIds[0]).toBe('node_created')
  expect(successfulCalls).toEqual([
    'getNewNodePosition',
    'addMediaGenerationNode',
    'openNodePanel',
    'resetComposerDraft',
    'focusNode',
  ])
})

test('submitComposerDraft keeps failed graph submissions editable without selecting a node', async () => {
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
      openNodePanel: () => failedCalls.push('openNodePanel'),
      resetComposerDraft: () => failedCalls.push('resetComposerDraft'),
      setDraftError: (error) => {
        expect(error).toBe('graph invalid')
        failedCalls.push('setDraftError')
      },
      setDraftExpanded: (expanded) => {
        expect(expanded).toBe(true)
        failedCalls.push('setDraftExpanded')
      },
    },
    baseMessages,
  )

  expect(useCanvasUiStore.getState().selectedNodeIds).toHaveLength(0)
  expect(failedCalls).toEqual(['getNewNodePosition', 'addMediaGenerationNode', 'setDraftExpanded', 'setDraftError'])
})
