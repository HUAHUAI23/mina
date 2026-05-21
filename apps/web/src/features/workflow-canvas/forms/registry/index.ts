export * from './client-model-registry'

import { imageClientModelSpecs } from './image-specs'
import { registerClientModel } from './client-model-registry'
import { videoClientModelSpecs } from './video-specs'

for (const spec of [...imageClientModelSpecs, ...videoClientModelSpecs]) {
  registerClientModel(spec)
}
