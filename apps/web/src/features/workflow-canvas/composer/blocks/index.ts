import {
  isMediaGenerationNode,
  type MediaGenerationCanvasNode,
} from '../../domain/canvas-node-types'
import type { ComposerRuntime } from '../types'
import { composerRegistry } from '../registry'
import { MediaComposerBlock } from './MediaComposerBlock'
import { MultiSelectionBlock } from './MultiSelectionBlock'
import { EmptyMediaComposer } from './EmptyMediaComposer'

composerRegistry.register<{ node: MediaGenerationCanvasNode; runtime: ComposerRuntime }>({
  id: 'media-composer',
  priority: 10,
  match: (ctx) => ctx.kind === 'node' && isMediaGenerationNode(ctx.node),
  surface: (ctx) => (ctx.kind === 'node' && isMediaGenerationNode(ctx.node) ? 'expanded' : 'hidden'),
  selectProps: (ctx, runtime) => {
    if (ctx.kind !== 'node' || !isMediaGenerationNode(ctx.node)) {
      throw new Error('Media composer block requires a media generation node')
    }
    return { node: ctx.node, runtime }
  },
  Component: MediaComposerBlock,
})

composerRegistry.register<{ runtime: ComposerRuntime }>({
  id: 'empty-media-composer',
  priority: 20,
  match: (ctx) => ctx.kind === 'empty',
  surface: (ctx) => (ctx.kind === 'empty' ? 'collapsed' : 'expanded'),
  selectProps: (_ctx, runtime) => ({
    runtime,
  }),
  Component: EmptyMediaComposer,
})

composerRegistry.register<{ nodeIds: string[] }>({
  id: 'multi-selection',
  priority: 20,
  match: (ctx) => ctx.kind === 'multi',
  surface: () => 'expanded',
  selectProps: (ctx) => {
    if (ctx.kind !== 'multi') {
      throw new Error('Multi selection block requires a multi context')
    }
    return { nodeIds: ctx.nodeIds }
  },
  Component: MultiSelectionBlock,
})
