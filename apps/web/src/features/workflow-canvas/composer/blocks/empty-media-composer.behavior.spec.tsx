import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { NodeMediaSlotItem } from '@mina/contracts/modules/media'

import { I18nProvider } from '../../../../app/i18n-provider'
import { useCanvasUiStore, type ComposerDraftState } from '../../store/canvas-ui-store'
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
              submitLabel="Insert node"
            />
          )}
        </MediaTaskFormProvider>
      </QueryClientProvider>
    </I18nProvider>,
  )
}

const emptyBlocks = composerRegistry.resolve({ kind: 'empty' })
if (emptyBlocks.length !== 1 || emptyBlocks[0]?.id !== 'empty-media-composer') {
  throw new Error('Empty selection should resolve to the explicit empty media composer block only.')
}

const collapsedDraft: ComposerDraftState = {
  expanded: false,
  mediaSlots: {},
  task: draftTask,
  uploads: {},
}
const collapsedHtml = renderDraftComposer(collapsedDraft, 'collapsed')

if (!collapsedHtml.includes('aria-label="Draft composer"')) {
  throw new Error('Collapsed empty composer should render the draft composer surface.')
}
if (!collapsedHtml.includes('grid-cols-[auto_minmax(0,1fr)_auto]')) {
  throw new Error('Collapsed empty composer should use a content-sized media column.')
}
if (!collapsedHtml.includes('data-variant="collapsed"') || !collapsedHtml.includes('[--composer-media-width:46px]')) {
  throw new Error('Collapsed empty composer should render the compact media slot variant.')
}
if (!collapsedHtml.includes('aria-label="Insert node"') || !collapsedHtml.includes('aria-label="Prompt"')) {
  throw new Error('Collapsed empty composer should expose prompt and insert controls.')
}
if (collapsedHtml.includes('Attach file') || collapsedHtml.includes('Add image') || collapsedHtml.includes('Video model') || collapsedHtml.includes('Image model')) {
  throw new Error('Collapsed empty composer should not render separate attach buttons or model hints.')
}
if (collapsedHtml.includes('Model configuration') || collapsedHtml.includes('Advanced settings')) {
  throw new Error('Collapsed empty composer should not render expanded model configuration.')
}

const expandedHtml = renderDraftComposer({
  expanded: true,
  mediaSlots: { inputImages: [uploadedMedia] },
  task: draftTask,
  uploads: {},
}, 'expanded')

if (!expandedHtml.includes('aria-label="Node composer"') || !expandedHtml.includes('aria-label="Model configuration"')) {
  throw new Error('Expanded empty composer should reuse the full media composer shell.')
}
if (!expandedHtml.includes('Gemini 3.1 Flash Image') || !expandedHtml.includes('Veo 3.1')) {
  throw new Error('Expanded empty composer should expose registered image and video models.')
}
if (!expandedHtml.includes('data-variant="attachment"')) {
  throw new Error('Expanded empty composer should render media slots in attachment mode.')
}

const uploadingHtml = renderDraftComposer({
  expanded: false,
  mediaSlots: {},
  task: draftTask,
  uploads: {
    upload_1: { slot: 'inputImages', status: 'uploading' },
  },
}, 'collapsed')

if (!uploadingHtml.includes('disabled=""') || !uploadingHtml.includes('title="Uploading"')) {
  throw new Error('Uploading draft composer should disable send and expose upload status.')
}

console.log('empty media composer behavior checks passed')
