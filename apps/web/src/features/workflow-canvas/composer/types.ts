import type { ComponentType } from 'react'
import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

export type ComposerSurface = 'collapsed' | 'expanded' | 'hidden'

export type ComposerContext =
  | { kind: 'empty' }
  | { kind: 'multi'; nodeIds: string[] }
  | { kind: 'node'; node: WorkflowCanvasNode }

export interface ComposerRuntime {
  onRunNode(nodeId: string): void
  runError?: string | undefined
  runningNodeId?: string | undefined
}

export interface ComposerBlockSpec<P extends object = object> {
  Component: ComponentType<P & { surface: Exclude<ComposerSurface, 'hidden'> }>
  id: string
  match(ctx: ComposerContext): boolean
  priority: number
  selectProps(ctx: ComposerContext, runtime: ComposerRuntime): P
  surface(ctx: ComposerContext): ComposerSurface
}

export type ResolvedComposerBlockSpec = Omit<ComposerBlockSpec<object>, 'Component'> & {
  Component: ComponentType<any>
}
