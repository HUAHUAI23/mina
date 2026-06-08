import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { NodeMediaSlotItem } from '@mina/contracts/modules/media'

import { I18nProvider } from '../../../../app/i18n-provider'
import { useCanvasUiStore, type ComposerDraftState } from '../../store/canvas-ui-store'
import { listAllClientModels } from '../../forms/registry/client-model-registry'
import { MediaTaskFormProvider } from '../media-task-form'
import { composerRegistry } from '../registry'
import type { ComposerRuntime } from '../types'
import './index'
import { MediaComposerShell } from './MediaComposerShell'

if (!globalThis.navigator?.languages) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      ...globalThis.navigator,
      language: globalThis.navigator?.language ?? 'en',
      languages: ['en'],
    },
  })
}

const draftTask = {
  kind: 'image_generation' as const,
  model: 'gemini-3.1-flash-image-preview',
  params: { aspectRatio: '1:1', count: 1, imageSize: '1K' },
  prompt: 'A compact draft prompt',
  provider: 'google',
}

const uploadedMedia: NodeMediaSlotItem = {
  id: 'uploaded_media',
  order: 0,
  required: true,
  slot: 'inputImages',
  source: { type: 'media_object', mediaObjectId: 'media_1' },
}

const runtime: ComposerRuntime = {
  onRunNode: () => undefined,
}

const renderDraftComposer = (draft: ComposerDraftState, mode: 'collapsed' | 'expanded'): string => {
  const queryClient = new QueryClient()
  useCanvasUiStore.setState({
    activeNodePanel: undefined,
    selectedNodeIds: [],
  })
  useCanvasUiStore.setState({ composerDraft: draft })

  return renderToStaticMarkup(
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <MediaTaskFormProvider kind="draft" draft={draft} onSubmitDraft={async () => undefined}>
          {() => (
            <MediaComposerShell
              mode={mode}
              modelScope="all"
              runError={draft.error}
              running={Boolean(runtime.runningNodeId)}
              submitDisabled={Object.values(draft.uploads).some((entry) => entry.status === 'uploading')}
            />
          )}
        </MediaTaskFormProvider>
      </QueryClientProvider>
    </I18nProvider>,
  )
}

test('empty media composer resolves and renders collapsed, expanded, and uploading states', () => {
  const emptyBlocks = composerRegistry.resolve({ kind: 'empty' })
  expect(emptyBlocks).toHaveLength(1)
  expect(emptyBlocks[0]?.id).toBe('empty-media-composer')

  const collapsedDraft: ComposerDraftState = {
    expanded: false,
    mediaSlots: {},
    task: draftTask,
    uploads: {},
  }
  const collapsedHtml = renderDraftComposer(collapsedDraft, 'collapsed')

  expect(collapsedHtml).toContain('aria-label="Draft composer"')
  expect(collapsedHtml).toContain('grid-cols-[auto_minmax(0,1fr)_auto]')
  expect(collapsedHtml).toContain('data-variant="collapsed"')
  expect(collapsedHtml).toContain('[--composer-media-width:46px]')
  expect(collapsedHtml).toContain('aria-label="Run"')
  expect(collapsedHtml).toContain('aria-label="Prompt"')
  expect(collapsedHtml).not.toContain('Insert node')
  expect(collapsedHtml).not.toContain('Attach file')
  expect(collapsedHtml).not.toContain('Add image')
  expect(collapsedHtml).not.toContain('Video model')
  expect(collapsedHtml).not.toContain('Image model')
  expect(collapsedHtml).not.toContain('Model configuration')
  expect(collapsedHtml).not.toContain('Advanced settings')

  const expandedHtml = renderDraftComposer({
    expanded: true,
    mediaSlots: { inputImages: [uploadedMedia] },
    task: draftTask,
    uploads: {},
  }, 'expanded')

  expect(expandedHtml).toContain('aria-label="Node composer"')
  expect(expandedHtml).toContain('aria-label="Model configuration"')
  expect(expandedHtml).toContain('Gemini 3.1 Flash Image')
  expect(listAllClientModels('image_generation').some((spec) => spec.displayName === 'Gemini 3.1 Flash Image')).toBe(true)
  expect(listAllClientModels('video_generation').some((spec) => spec.displayName === 'Veo 3.1')).toBe(true)
  expect(expandedHtml).toContain('data-variant="attachment"')

  const uploadingHtml = renderDraftComposer({
    expanded: false,
    mediaSlots: {},
    task: draftTask,
    uploads: {
      upload_1: { slot: 'inputImages', status: 'uploading' },
    },
  }, 'collapsed')

  expect(uploadingHtml).toContain('disabled=""')
  expect(uploadingHtml).toContain('aria-label="Uploading"')
})
