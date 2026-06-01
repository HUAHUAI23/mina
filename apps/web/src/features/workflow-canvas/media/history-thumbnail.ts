import type { NodeExecutionOutput, NodeOutputResource } from '@mina/contracts/modules/tasks'

import { videoPosterResource } from '../utils/media-view'

export const historyThumbnailResource = (
  output: NodeExecutionOutput | undefined,
  resource: NodeOutputResource,
): NodeOutputResource =>
  resource.kind === 'video'
    ? videoPosterResource(output, resource) ?? resource
    : resource
