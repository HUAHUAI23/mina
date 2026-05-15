import type { TaskConfig } from '@mina/contracts/modules/tasks'

import type { ModelRegistry } from '../models/model-registry'
import type { PrepareConfigInput } from '../models/model-spec'

export class TaskConfigAssembler {
  constructor(private readonly modelRegistry: ModelRegistry) {}

  prepare(input: PrepareConfigInput): TaskConfig {
    const spec = this.modelRegistry.get(input.draft.kind, input.draft.provider, input.draft.model)
    return spec.prepareConfig(input)
  }
}
