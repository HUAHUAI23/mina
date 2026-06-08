import { useCallback, useEffect, useRef, type RefObject } from 'react'
import type { FinalConnectionState, Position, ReactFlowInstance, XYPosition } from '@xyflow/react'

import { getCanvasAddMenuGhostAnchor, getCanvasAddMenuLayout } from '../components/canvas-add-menu-layout'
import { useCanvasUiStore } from '../store/canvas-ui-store'
import { getFlowRenderSnapshot } from '../render/flow-render-store'
import type { WorkflowFlowEdge, WorkflowFlowNode } from '../domain/flow-types'
import type { CanvasDomScope } from '../utils/canvas-dom-scope'

export interface OpenCanvasAddMenuInput {
  sourceFlowPosition?: XYPosition | undefined
  sourceHandle?: string | undefined
  sourceId?: string | undefined
  sourcePosition?: Position | undefined
  scope?: CanvasDomScope | undefined
  trigger: 'canvas' | 'connection'
}

const getClientPosition = (event: MouseEvent | TouchEvent | React.MouseEvent): { x: number; y: number } | undefined => {
  if ('clientX' in event && 'clientY' in event) {
    return { x: event.clientX, y: event.clientY }
  }
  const touch = event.changedTouches[0] ?? event.touches[0]
  return touch ? { x: touch.clientX, y: touch.clientY } : undefined
}

const isMediaConnectionSourceNode = (node: WorkflowFlowNode | undefined): node is WorkflowFlowNode =>
  node?.type === 'image_generation' || node?.type === 'video_generation'

interface CanvasAddMenuControllerInput {
  reactFlowInstanceRef: RefObject<ReactFlowInstance<WorkflowFlowNode, WorkflowFlowEdge> | null>
  stageRef: RefObject<HTMLDivElement | null>
}

export function useCanvasAddMenuController({
  reactFlowInstanceRef,
  stageRef,
}: CanvasAddMenuControllerInput) {
  const openAddMenu = useCanvasUiStore((state) => state.openAddMenu)
  const connectionDropMenuTimerRef = useRef<number | undefined>(undefined)

  useEffect(() => () => {
    if (connectionDropMenuTimerRef.current !== undefined) {
      window.clearTimeout(connectionDropMenuTimerRef.current)
    }
  }, [])

  const openCanvasAddMenuAtClientPosition = useCallback((
    clientPosition: { x: number; y: number },
    input: OpenCanvasAddMenuInput,
  ) => {
    const reactFlow = reactFlowInstanceRef.current
    const stage = stageRef.current
    if (!reactFlow || !stage) {
      return
    }
    const bounds = stage.getBoundingClientRect()
    const nextState = {
      containerSize: { height: bounds.height, width: bounds.width },
      flowPosition: reactFlow.screenToFlowPosition(clientPosition),
      scope: input.scope ?? { scope: 'root' as const },
      screenPosition: {
        x: clientPosition.x - bounds.left,
        y: clientPosition.y - bounds.top,
      },
      ...(input.sourceHandle ? { sourceHandle: input.sourceHandle } : {}),
      ...(input.sourceId ? { sourceId: input.sourceId } : {}),
      trigger: input.trigger,
    }
    if (input.trigger !== 'connection' || !input.sourceFlowPosition || !input.sourcePosition) {
      openAddMenu(nextState)
      return
    }

    const sourceClientPosition = reactFlow.flowToScreenPosition(input.sourceFlowPosition)
    const sourceScreenPosition = {
      x: sourceClientPosition.x - bounds.left,
      y: sourceClientPosition.y - bounds.top,
    }
    const anchor = getCanvasAddMenuGhostAnchor({
      layout: getCanvasAddMenuLayout(nextState),
      sourceX: sourceScreenPosition.x,
    })
    openAddMenu(nextState, {
      sourcePosition: input.sourcePosition,
      sourceX: sourceScreenPosition.x,
      sourceY: sourceScreenPosition.y,
      targetPosition: anchor.targetPosition,
      targetX: anchor.x,
      targetY: anchor.y,
    })
  }, [openAddMenu, reactFlowInstanceRef, stageRef])

  const openCanvasAddMenu = useCallback((
    event: MouseEvent | TouchEvent | React.MouseEvent,
    input: OpenCanvasAddMenuInput,
  ) => {
    const clientPosition = getClientPosition(event)
    if (!clientPosition) {
      return
    }
    openCanvasAddMenuAtClientPosition(clientPosition, input)
  }, [openCanvasAddMenuAtClientPosition])

  const handleConnectStart = useCallback(() => {
    stageRef.current?.setAttribute('data-connecting', '')
  }, [stageRef])

  const handleConnectEnd = useCallback((event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
    stageRef.current?.removeAttribute('data-connecting')
    const sourceNode = getFlowRenderSnapshot().flowNodesById[connectionState.fromNode?.id ?? '']
    const sourceHandleId = connectionState.fromHandle?.id ?? undefined
    if (
      isMediaConnectionSourceNode(sourceNode) &&
      connectionState.from &&
      connectionState.fromPosition &&
      (connectionState.fromHandle?.type ?? 'source') === 'source' &&
      !connectionState.toNode
    ) {
      const clientPosition = getClientPosition(event)
      if (!clientPosition) {
        return
      }
      const menuInput = {
        sourceFlowPosition: connectionState.from,
        ...(sourceHandleId ? { sourceHandle: sourceHandleId } : {}),
        sourceId: sourceNode.id,
        sourcePosition: connectionState.fromPosition,
        trigger: 'connection' as const,
      }
      if (connectionDropMenuTimerRef.current !== undefined) {
        window.clearTimeout(connectionDropMenuTimerRef.current)
      }
      connectionDropMenuTimerRef.current = window.setTimeout(() => {
        connectionDropMenuTimerRef.current = undefined
        openCanvasAddMenuAtClientPosition(clientPosition, menuInput)
      }, 0)
    }
  }, [openCanvasAddMenuAtClientPosition, stageRef])

  return {
    handleConnectEnd,
    handleConnectStart,
    openCanvasAddMenu,
  }
}
