import { slotRendererRegistry } from '../slot-renderer-registry'
import { MediaStackSlotRenderer } from './MediaStackSlotRenderer'

slotRendererRegistry.register({
  id: 'media-stack',
  priority: 10,
  match: () => true,
  Component: MediaStackSlotRenderer,
})
