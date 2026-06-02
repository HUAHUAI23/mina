import { MediaComposerShell } from './MediaComposerShell'
import { useMessages } from '../../../../app/i18n-provider'
import { useCanvasUiStore } from '../../store/canvas-ui-store'
import type { ComposerRuntime, ComposerSurface } from '../types'

interface EmptyMediaComposerProps {
  runtime: ComposerRuntime
  surface: Exclude<ComposerSurface, 'hidden'>
}

export function EmptyMediaComposer({ runtime }: EmptyMediaComposerProps) {
  const m = useMessages()
  const draft = useCanvasUiStore((state) => state.composerDraft)
  const setDraftExpanded = useCanvasUiStore((state) => state.setDraftExpanded)
  const uploading = Object.values(draft.uploads).some((entry) => entry.status === 'uploading')
  const error = draft.error ?? runtime.runError

  return (
    <MediaComposerShell
      mode={draft.expanded ? 'expanded' : 'collapsed'}
      modelScope="all"
      onExpand={() => setDraftExpanded(true)}
      runError={error}
      running={Boolean(runtime.runningNodeId)}
      submitDisabled={uploading}
      submitLabel={m.workflow_canvas_insert_node()}
    />
  )
}
