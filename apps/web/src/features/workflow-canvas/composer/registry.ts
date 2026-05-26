import type { ComposerBlockSpec, ComposerContext, ResolvedComposerBlockSpec } from './types'

class ComposerRegistry {
  private specs: ResolvedComposerBlockSpec[] = []

  register<P extends object>(spec: ComposerBlockSpec<P>): void {
    if (this.specs.some((candidate) => candidate.id === spec.id)) {
      return
    }
    this.specs.push(spec as unknown as ResolvedComposerBlockSpec)
  }

  resolve(ctx: ComposerContext): ResolvedComposerBlockSpec[] {
    return this.specs
      .filter((spec) => spec.match(ctx) && spec.surface(ctx) !== 'hidden')
      .sort((left, right) => left.priority - right.priority)
  }
}

export const composerRegistry = new ComposerRegistry()
