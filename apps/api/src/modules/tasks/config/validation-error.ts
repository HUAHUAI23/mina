import { HttpError } from '../../../lib/http/http-error'

export class TaskConfigValidationError extends HttpError {
  constructor(message: string) {
    super(422, 'TASK_CONFIG_INVALID', message)
  }
}
