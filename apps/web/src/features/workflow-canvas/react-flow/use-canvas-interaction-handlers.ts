import { useCallback, type MouseEvent } from 'react'
import type { NodeMouseHandler } from '@xyflow/react'

import { selectWorkflowCanvasNodes } from '../store/canvas-selection-actions'
import { useCanvasUiStore } from '../store/canvas-ui-store'
import { useFlowRenderStore } from '../render/flow-render-store'
import { publishLocalSelection } from '../sync/workflow-presence'
import { isIgnoredCanvasTarget, isReactFlowPaneTarget, resolveCanvasDomScope } from '../utils/canvas-dom-scope'
import type { OpenCanvasAddMenuInput } from './use-canvas-add-menu-controller'
import type { WorkflowFlowEdge, WorkflowFlowNode } from '../domain/flow-types'

const shouldOpenConfigDockForNode = (node: WorkflowFlowNode): boolean =>
  node.type === 'image_generation' || node.type === 'video_generation'

interface UseCanvasInteractionHandlersInput {
  openCanvasAddMenu(event: globalThis.MouseEvent | TouchEvent | MouseEvent, input: OpenCanvasAddMenuInput): void
}

export const useCanvasInteractionHandlers = ({
  openCanvasAddMenu,
}: UseCanvasInteractionHandlersInput) => {
  const closeAddMenu = useCanvasUiStore((state) => state.closeAddMenu)
  const closeNodePanel = useCanvasUiStore((state) => state.closeNodePanel)
  const openNodePanel = useCanvasUiStore((state) => state.openNodePanel)
  const setHoveredEdgeId = useCanvasUiStore((state) => state.setHoveredEdgeId)
  const setSelectionDragActive = useFlowRenderStore((state) => state.setSelectionDragActive)

  const handleNodeClick = useCallback<NodeMouseHandler<WorkflowFlowNode>>((event, node) => {
    if (isIgnoredCanvasTarget(event.target)) {
      return
    }
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      return
    }
    if (!shouldOpenConfigDockForNode(node)) {
      closeNodePanel()
      return
    }
    openNodePanel(node.id, 'config')
  }, [closeNodePanel, openNodePanel])

  const handlePaneClick = useCallback(
    (event: MouseEvent) => {
      if (isReactFlowPaneTarget(event.target)) {
        closeAddMenu()
        closeNodePanel()
        selectWorkflowCanvasNodes([])
      }
    },
    [closeAddMenu, closeNodePanel],
  )

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: { nodes: WorkflowFlowNode[]; edges: WorkflowFlowEdge[] }) => {
      const nodeIds = selectedNodes.map((node) => node.id)
      selectWorkflowCanvasNodes(nodeIds)
      publishLocalSelection({
        edgeIds: selectedEdges.map((edge) => edge.id),
        nodeIds,
      })
    },
    [],
  )

  const handleEdgeMouseEnter = useCallback((_event: MouseEvent, edge: WorkflowFlowEdge) => {
    setHoveredEdgeId(edge.id)
  }, [setHoveredEdgeId])

  const handleEdgeMouseLeave = useCallback((_event: MouseEvent, edge: WorkflowFlowEdge) => {
    const current = useCanvasUiStore.getState().hoveredEdgeId
    if (current === edge.id) {
      setHoveredEdgeId(undefined)
    }
  }, [setHoveredEdgeId])

  const handleCanvasDoubleClick = useCallback((event: MouseEvent) => {
    const scope = resolveCanvasDomScope(event.target)
    if (!scope) {
      return
    }
    event.preventDefault()
    selectWorkflowCanvasNodes([])
    openCanvasAddMenu(event, { scope, trigger: 'canvas' })
  }, [openCanvasAddMenu])

  const handleSelectionStart = useCallback(() => {
    closeAddMenu()
    closeNodePanel()
    setSelectionDragActive(true)
  }, [closeAddMenu, closeNodePanel, setSelectionDragActive])

  const handleSelectionEnd = useCallback(() => {
    setSelectionDragActive(false)
  }, [setSelectionDragActive])

  return {
    handleCanvasDoubleClick,
    handleEdgeMouseEnter,
    handleEdgeMouseLeave,
    handleNodeClick,
    handlePaneClick,
    handleSelectionChange,
    handleSelectionEnd,
    handleSelectionStart,
  }
}
