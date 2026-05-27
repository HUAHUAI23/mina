import { HttpError } from '../../../lib/http/http-error'

export class TaskConfigValidationError extends HttpError {
  constructor(message: string) {
    super(422, 'TASK_CONFIG_INVALID', {
      fallbackMessage: message,
      messageKey: message === 'Prompt is required.' ? 'api_error_task_prompt_required' : 'api_error_task_config_invalid',
    })
  }
}
