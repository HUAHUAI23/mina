import { MediaObjectService } from '../../modules/media/media-object.service'
import type { RemoteMediaFetcher } from '../../modules/media/remote-media-fetcher'
import { FakeMediaObjectRepository, FakeObjectStorage } from '../doubles'

const missingFetcher: RemoteMediaFetcher = {
  fetch: async () => {
    throw new Error('fetcher not configured')
  },
}

export const createMediaObjectTestScenario = (input: {
  fetcher?: RemoteMediaFetcher
  storage?: FakeObjectStorage
} = {}) => {
  const repository = new FakeMediaObjectRepository()
  const storage = input.storage ?? new FakeObjectStorage()
  const service = new MediaObjectService(
    repository,
    storage,
    input.fetcher ?? missingFetcher,
  )

  return { repository, service, storage }
}
