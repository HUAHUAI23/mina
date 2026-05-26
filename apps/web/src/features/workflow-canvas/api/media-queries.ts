import { MediaObjectResponseSchema, type MediaObjectResponse } from '@mina/contracts/modules/media/media-object'

import { apiClient } from '../../../lib/api-client'
import { readJson } from '../../../lib/http'

export const getMediaObject = async (mediaObjectId: string): Promise<MediaObjectResponse> => {
  const response = await apiClient.api['media-objects'][':id'].$get({ param: { id: mediaObjectId } })
  return readJson(response, MediaObjectResponseSchema)
}

