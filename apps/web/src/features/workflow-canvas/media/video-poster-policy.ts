import type { NodeExecutionOutput, NodeOutputResource } from '@mina/contracts/modules/tasks'

import { videoPosterResource } from '../utils/media-view'

export const selectVideoPosterResource = (
  output: NodeExecutionOutput | undefined,
  video: NodeOutputResource | undefined,
): NodeOutputResource | undefined => videoPosterResource(output, video)
