import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'

import type { VideoGenerationFlowNode } from '../../../domain/flow-types'
import { MediaNodeShell } from './MediaNodeShell'
import { VideoPosterPreview } from './VideoPosterPreview'

type VideoGenerationNodeProps = NodeProps<VideoGenerationFlowNode>

const videoGenerationNodePropsEqual = (
  previous: VideoGenerationNodeProps,
  next: VideoGenerationNodeProps,
): boolean =>
  previous.id === next.id &&
  previous.data.nodeId === next.data.nodeId &&
  previous.data.title === next.data.title &&
  previous.data.mediaView?.taskId === next.data.mediaView?.taskId &&
  previous.data.mediaView?.outputResourceId === next.data.mediaView?.outputResourceId &&
  previous.data.mediaView?.outputIndex === next.data.mediaView?.outputIndex

export const VideoGenerationNode = memo(function VideoGenerationNode({ data, id }: VideoGenerationNodeProps) {
  return (
    <MediaNodeShell
      id={id}
      mediaView={data.mediaView}
      nodeType="video_generation"
      title={data.title}
      renderPreview={({ preview }) => <VideoPosterPreview resource={preview.resource} poster={preview.poster} />}
    />
  )
}, videoGenerationNodePropsEqual)
