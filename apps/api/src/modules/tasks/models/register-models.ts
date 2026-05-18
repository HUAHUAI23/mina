import { DevImageSpec } from '../providers/dev/image.spec'
import { DevVideoSpec } from '../providers/dev/video.spec'
import { GoogleGeminiImageSpec } from '../providers/google/image/gemini.spec'
import { GoogleVeoSpec } from '../providers/google/video/veo.spec'
import { VolcengineSeedreamSpec } from '../providers/volcengine/image/seedream.spec'
import { VolcengineSeedanceSpec } from '../providers/volcengine/video/seedance.spec'
import type { ModelRegistry } from './model-registry'

export const registerTaskModels = (registry: ModelRegistry): ModelRegistry => {
  registry.register(new DevImageSpec())
  registry.register(new DevVideoSpec())
  registry.register(new GoogleGeminiImageSpec('gemini-3.1-flash-image-preview'))
  registry.register(new GoogleGeminiImageSpec('gemini-3-pro-image-preview'))
  registry.register(new GoogleVeoSpec('veo-3.1-generate-preview'))
  registry.register(new GoogleVeoSpec('veo-3.1-fast-generate-preview'))
  registry.register(new VolcengineSeedreamSpec('doubao-seedream-5-0-260128'))
  registry.register(new VolcengineSeedreamSpec('doubao-seedream-4-5-251128'))
  registry.register(new VolcengineSeedanceSpec('doubao-seedance-2-0-260128'))
  registry.register(new VolcengineSeedanceSpec('doubao-seedance-1-5-pro-251215'))
  registry.register(new VolcengineSeedanceSpec('jimeng-video-seedance-2.0'))
  registry.register(new VolcengineSeedanceSpec('jimeng-video-seedance-2.0-fast'))
  return registry
}
