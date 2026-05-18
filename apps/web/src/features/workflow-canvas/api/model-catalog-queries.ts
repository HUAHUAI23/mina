import {
  TaskModelCatalogResponseSchema,
  type TaskModelCatalogResponse,
} from '@mina/contracts/modules/tasks/model-catalog'

import { apiClient } from '../../../lib/api-client'
import { readJson } from '../../../lib/http'

export const listTaskModels = async (): Promise<TaskModelCatalogResponse> => {
  const response = await apiClient.api.tasks.models.$get()
  return readJson(response, TaskModelCatalogResponseSchema)
}
