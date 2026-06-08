import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'

import type { ImageGenerationFlowNode } from '../../../domain/flow-types'
import { ImagePreview } from './ImagePreview'
import { MediaNodeShell } from './MediaNodeShell'

type ImageGenerationNodeProps = NodeProps<ImageGenerationFlowNode>

const imageGenerationNodePropsEqual = (
  previous: ImageGenerationNodeProps,
  next: ImageGenerationNodeProps,
): boolean =>
  previous.id === next.id &&
  previous.parentId === next.parentId &&
  previous.selected === next.selected &&
  previous.data.nodeId === next.data.nodeId &&
  previous.data.title === next.data.title &&
  previous.data.mediaView?.taskId === next.data.mediaView?.taskId &&
  previous.data.mediaView?.outputResourceId === next.data.mediaView?.outputResourceId &&
  previous.data.mediaView?.outputIndex === next.data.mediaView?.outputIndex

export const ImageGenerationNode = memo(function ImageGenerationNode({ data, id, parentId, selected }: ImageGenerationNodeProps) {
  return (
    <MediaNodeShell
      id={id}
      mediaView={data.mediaView}
      nodeType="image_generation"
      parentId={parentId}
      selected={selected}
      title={data.title}
      renderPreview={({ preview }) => <ImagePreview resource={preview.resource} />}
    />
  )
}, imageGenerationNodePropsEqual)
