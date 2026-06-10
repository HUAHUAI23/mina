import {
  MediaObjectResponseSchema,
  type CreateMediaObjectInput,
  type MediaObjectResponse,
} from '@mina/contracts/modules/media/media-object'

import { apiClient } from '../../../lib/api-client'
import { readJson } from '../../../lib/http'

export const uploadMediaObject = async (
  file: File,
  options: Partial<Pick<CreateMediaObjectInput, 'purpose' | 'retention'>> = {},
): Promise<MediaObjectResponse> => {
  const response = await apiClient.api['media-objects'].$post({
    form: {
      file,
      purpose: options.purpose ?? 'workflow_slot',
      retention: options.retention ?? 'project_scoped',
    },
  })
  return readJson(response, MediaObjectResponseSchema)
}
