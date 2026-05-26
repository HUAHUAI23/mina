import { imageClientModelSpecs } from './image-specs'
import { registerClientModel } from './client-model-registry'
import { videoClientModelSpecs } from './video-specs'

export const allClientModelSpecs = [...imageClientModelSpecs, ...videoClientModelSpecs] as const

for (const spec of allClientModelSpecs) {
  registerClientModel(spec)
}
