import { MediaObjectResponseSchema, type MediaObjectResponse } from '@mina/contracts/modules/media/media-object'

import { apiClient } from '../../../lib/api-client'
import { readJson } from '../../../lib/http'

export const uploadMediaObject = async (file: File): Promise<MediaObjectResponse> => {
  const response = await apiClient.api['media-objects'].$post({
    form: {
      file,
      purpose: 'workflow_slot',
      retention: 'project_scoped',
    },
  })
  return readJson(response, MediaObjectResponseSchema)
}
