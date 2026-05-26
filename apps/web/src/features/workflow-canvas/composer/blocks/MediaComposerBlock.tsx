import type { ComposerRuntime, ComposerSurface } from '../types'
import type { MediaGenerationCanvasNode } from '../../domain/canvas-node-types'
import { MediaComposerShell } from './MediaComposerShell'

interface MediaComposerBlockProps {
  node: MediaGenerationCanvasNode
  runtime: ComposerRuntime
  surface: Exclude<ComposerSurface, 'hidden'>
}

export function MediaComposerBlock({ node, runtime }: MediaComposerBlockProps) {
  return (
    <MediaComposerShell
      mode="expanded"
      runError={runtime.runError}
      running={runtime.runningNodeId === node.id}
    />
  )
}
