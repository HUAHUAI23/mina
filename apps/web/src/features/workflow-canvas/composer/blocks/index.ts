import {
  isMediaGenerationNode,
  type MediaGenerationCanvasNode,
} from '../../domain/canvas-node-types'
import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import type { ComposerRuntime } from '../types'
import { composerRegistry } from '../registry'
import { GroupBlock } from './GroupBlock'
import { MediaComposerBlock } from './MediaComposerBlock'
import { MultiSelectionBlock } from './MultiSelectionBlock'
import { PromptBlock } from './PromptBlock'
import { TextBlock } from './TextBlock'

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

composerRegistry.register<{ node?: MediaGenerationCanvasNode | undefined; runtime: ComposerRuntime }>({
  id: 'prompt',
  priority: 20,
  match: (ctx) => ctx.kind === 'empty',
  surface: (ctx) => (ctx.kind === 'empty' ? 'collapsed' : 'expanded'),
  selectProps: (_ctx, runtime) => ({
    node: undefined,
    runtime,
  }),
  Component: PromptBlock,
})

composerRegistry.register<{ node: WorkflowCanvasNode }>({
  id: 'text',
  priority: 20,
  match: (ctx) => ctx.kind === 'node' && ctx.node.data.nodeType === 'text',
  surface: () => 'expanded',
  selectProps: (ctx) => {
    if (ctx.kind !== 'node' || ctx.node.data.nodeType !== 'text') {
      throw new Error('Text block requires a text node')
    }
    return { node: ctx.node }
  },
  Component: TextBlock,
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

composerRegistry.register<{ node: WorkflowCanvasNode; runtime: ComposerRuntime }>({
  id: 'group',
  priority: 20,
  match: (ctx) => ctx.kind === 'node' && (ctx.node.data.nodeType === 'flow_group' || ctx.node.data.nodeType === 'node_group'),
  surface: () => 'expanded',
  selectProps: (ctx, runtime) => {
    if (ctx.kind !== 'node' || (ctx.node.data.nodeType !== 'flow_group' && ctx.node.data.nodeType !== 'node_group')) {
      throw new Error('Group block requires a group node')
    }
    return { node: ctx.node, runtime }
  },
  Component: GroupBlock,
})
