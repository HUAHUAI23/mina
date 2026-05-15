import type { Task, TaskKind } from '@mina/contracts/modules/tasks'

import { HttpError } from '../../../lib/http/http-error'
import { modelKey } from './model-key'
import type { ModelSpec } from './model-spec'

export class ModelRegistry {
  private readonly specs = new Map<string, ModelSpec>()

  register(spec: ModelSpec): void {
    const key = modelKey(spec.key)
    if (this.specs.has(key)) {
      throw new Error(`Duplicate task model registration: ${key}`)
    }
    this.specs.set(key, spec)
  }

  get(kind: TaskKind, provider: string, model: string): ModelSpec {
    const spec = this.specs.get(modelKey({ kind, provider, model }))
    if (!spec) {
      throw new HttpError(422, 'TASK_MODEL_UNSUPPORTED', `Unsupported task model: ${kind}/${provider}/${model}.`)
    }
    return spec
  }

  getForTask(task: Task): ModelSpec {
    return this.get(task.kind, task.provider, task.model)
  }

  list(): ModelSpec[] {
    return [...this.specs.values()]
  }
}
