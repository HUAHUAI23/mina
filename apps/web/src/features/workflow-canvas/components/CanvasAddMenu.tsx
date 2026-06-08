import { Boxes, GitBranch, ImageIcon, StickyNote, Video } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { WorkflowNodeType } from '@mina/contracts/modules/canvas'

import { useMessages } from '../../../app/i18n-provider'
import { defaultTaskForNodeType } from '../domain/canvas-node-types'
import { selectWorkflowCanvasNodes } from '../store/canvas-selection-actions'
import { useCanvasStore } from '../store/canvas-store'
import { useCanvasUiStore, type CanvasAddMenuState } from '../store/canvas-ui-store'
import { CANVAS_ADD_MENU_WIDTH, getCanvasAddMenuLayout } from './canvas-add-menu-layout'

interface CanvasAddMenuProps {
  state: CanvasAddMenuState
}

type AddableNodeType = Extract<WorkflowNodeType, 'flow_group' | 'image_generation' | 'node_group' | 'text' | 'video_generation'>
type MediaNodeType = Extract<WorkflowNodeType, 'image_generation' | 'video_generation'>

const isMediaNodeType = (nodeType: AddableNodeType): nodeType is MediaNodeType =>
  nodeType === 'image_generation' || nodeType === 'video_generation'

const shouldOpenConfigDockForCreatedNode = (nodeType: AddableNodeType): boolean =>
  isMediaNodeType(nodeType)

const nodeSizeEstimate = (nodeType: AddableNodeType): { height: number; width: number } => {
  if (nodeType === 'text') {
    return { height: 124, width: 220 }
  }
  if (nodeType === 'flow_group') {
    return { height: 340, width: 560 }
  }
  if (nodeType === 'node_group') {
    return { height: 300, width: 520 }
  }
  return { height: 244, width: 390 }
}

export function CanvasAddMenu({ state }: CanvasAddMenuProps) {
  const m = useMessages()
  const addConnectedMediaGenerationNode = useCanvasStore((canvasState) => canvasState.addConnectedMediaGenerationNode)
  const addNode = useCanvasStore((canvasState) => canvasState.addNode)
  const addMediaGenerationNode = useCanvasStore((canvasState) => canvasState.addMediaGenerationNode)
  const closeAddMenu = useCanvasUiStore((uiState) => uiState.closeAddMenu)
  const openNodePanel = useCanvasUiStore((uiState) => uiState.openNodePanel)
  const firstOptionRef = useRef<HTMLButtonElement | null>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        closeAddMenu()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeAddMenu])

  const options = useMemo(() => {
    const allOptions = [
      {
        description: m.workflow_canvas_add_image_node_description(),
        icon: ImageIcon,
        label: m.workflow_canvas_add_image_node(),
        type: 'image_generation' as const,
      },
      {
        description: m.workflow_canvas_add_video_node_description(),
        icon: Video,
        label: m.workflow_canvas_add_video_node(),
        type: 'video_generation' as const,
      },
      {
        description: m.workflow_canvas_add_text_node_description(),
        icon: StickyNote,
        label: m.workflow_canvas_add_text_node(),
        type: 'text' as const,
      },
      {
        description: m.workflow_canvas_add_node_group_description(),
        icon: Boxes,
        label: m.workflow_canvas_add_node_group(),
        type: 'node_group' as const,
      },
      {
        description: m.workflow_canvas_add_flow_group_description(),
        icon: GitBranch,
        label: m.workflow_canvas_add_flow_group(),
        type: 'flow_group' as const,
      },
    ]
    return state.trigger === 'connection'
      ? allOptions.filter((option) => isMediaNodeType(option.type))
      : state.scope.scope === 'root'
        ? allOptions
        : allOptions.filter((option) => option.type !== 'flow_group' && option.type !== 'node_group')
  }, [m, state.scope.scope, state.trigger])

  useEffect(() => {
    firstOptionRef.current?.focus()
  }, [state])

  const focusOption = useCallback((index: number) => {
    const next = optionRefs.current[index]
    next?.focus()
  }, [])

  const handleMenuKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    const currentIndex = optionRefs.current.findIndex((option) => option === document.activeElement)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusOption((currentIndex + 1 + options.length) % options.length)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusOption((currentIndex - 1 + options.length) % options.length)
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      focusOption(0)
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      focusOption(options.length - 1)
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      const lastIndex = options.length - 1
      if (event.shiftKey) {
        focusOption(currentIndex <= 0 ? lastIndex : currentIndex - 1)
        return
      }
      focusOption(currentIndex >= lastIndex ? 0 : currentIndex + 1)
    }
  }, [focusOption, options.length])

  const createNode = useCallback((nodeType: AddableNodeType) => {
    const size = nodeSizeEstimate(nodeType)
    const position = {
      x: Math.round(state.flowPosition.x - size.width / 2),
      y: Math.round(state.flowPosition.y - size.height / 2),
    }
    let nodeId: string | undefined
    if (state.trigger === 'connection') {
      if (!state.sourceId || !isMediaNodeType(nodeType)) {
        return
      }
      nodeId = addConnectedMediaGenerationNode({
        nodeType,
        position,
        sourceId: state.sourceId,
        ...(state.sourceHandle ? { sourceHandle: state.sourceHandle } : {}),
        task: defaultTaskForNodeType(nodeType),
      })
    } else if (isMediaNodeType(nodeType)) {
      nodeId = addMediaGenerationNode({
        nodeType,
        ...(state.scope.scope !== 'root' ? { parentId: state.scope.scopeNodeId } : {}),
        position,
        task: defaultTaskForNodeType(nodeType),
      })
    } else {
      nodeId = addNode(nodeType, undefined, {
        ...(state.scope.scope !== 'root' ? { parentId: state.scope.scopeNodeId } : {}),
        position,
      })
    }
    if (!nodeId) {
      return
    }
    selectWorkflowCanvasNodes([nodeId])
    if (shouldOpenConfigDockForCreatedNode(nodeType)) {
      openNodePanel(nodeId, 'config')
    }
    closeAddMenu()
  }, [addConnectedMediaGenerationNode, addMediaGenerationNode, addNode, closeAddMenu, openNodePanel, state])

  const position = getCanvasAddMenuLayout(state)
  const title = state.trigger === 'canvas'
    ? m.workflow_canvas_add_node()
    : m.workflow_canvas_insert_node_on_connection()

  return (
    <>
      <button
        aria-label={m.workflow_canvas_close_add_menu()}
        className="absolute inset-0 z-30 cursor-default bg-transparent"
        data-mina-canvas-ignore="true"
        onClick={closeAddMenu}
        tabIndex={-1}
        type="button"
      />
      <div
        className="nodrag nowheel nopan absolute z-40 grid max-h-96 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-md"
        data-mina-canvas-ignore="true"
        aria-label={title}
        aria-modal="true"
        aria-orientation="vertical"
        onKeyDown={handleMenuKeyDown}
        role="dialog"
        style={{ left: position.left, top: position.top, width: CANVAS_ADD_MENU_WIDTH }}
      >
        <div className="px-3 py-2 border-b border-border/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">{title}</span>
          </div>
        </div>
        <div className="grid max-h-72 gap-0.5 overflow-y-auto p-1">
          {options.map((option, index) => {
            const Icon = option.icon
            return (
              <button
                key={option.type}
                className="group flex items-center gap-3 rounded-sm border-0 px-2.5 py-1.5 text-left transition-colors hover:bg-accent hover:text-accent-foreground outline-hidden focus-visible:bg-accent focus-visible:text-accent-foreground cursor-pointer"
                onClick={() => createNode(option.type)}
                ref={(element) => {
                  optionRefs.current[index] = element
                  if (index === 0) {
                    firstOptionRef.current = element
                  }
                }}
                type="button"
              >
                <Icon aria-hidden="true" size={16} className="text-muted-foreground group-hover:text-accent-foreground transition-colors mr-1" />
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground leading-none">
                    {option.label}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground leading-normal mt-1 group-hover:text-accent-foreground/70">
                    {option.description}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
