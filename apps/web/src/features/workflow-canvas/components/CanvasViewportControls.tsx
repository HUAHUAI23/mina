import { useCallback, useEffect, useState, type CSSProperties, type RefObject } from 'react'
import { MiniMap, useViewport } from '@xyflow/react'
import type { ReactFlowInstance } from '@xyflow/react'
import { formatNumber, type MinaLocale } from '@mina/i18n'
import { Check, CircleHelp, Keyboard, Map as MapIcon, Maximize2, Minus, Plus } from 'lucide-react'
import { Kbd } from '@mina/ui/components/kbd'
import { Popover, PopoverContent, PopoverTrigger } from '@mina/ui/components/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@mina/ui/components/tooltip'

import { useMessages } from '../../../app/i18n-provider'
import type { WorkflowFlowEdge, WorkflowFlowNode } from '../domain/flow-types'

const MINIMAP_WIDTH = 260
const MINIMAP_HEIGHT = 160
const MINIMAP_STYLE = {
  width: MINIMAP_WIDTH,
  height: MINIMAP_HEIGHT,
} satisfies CSSProperties
const ZOOM_PERCENT_OPTIONS = [50, 100, 200] as const
const ZOOM_INPUT_MIN_PERCENT = 10
const ZOOM_INPUT_MAX_PERCENT = 300

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

const getMiniMapNodeColor = (node: WorkflowFlowNode): string => {
  switch (node.type) {
    case 'image_generation':
      return 'oklch(0.62 0.055 210)'
    case 'video_generation':
      return 'oklch(0.58 0.05 286)'
    case 'text':
      return 'oklch(0.72 0.018 247)'
    case 'flow_group':
      return 'oklch(0.64 0.035 155)'
    case 'node_group':
      return 'oklch(0.68 0.026 80)'
    default:
      return 'var(--foreground-quaternary)'
  }
}

interface CanvasViewportControlsProps {
  isMiniMapInteractive: boolean
  locale: MinaLocale
  nodeCount: number
  reactFlowInstanceRef: RefObject<ReactFlowInstance<WorkflowFlowNode, WorkflowFlowEdge> | null>
  shouldRenderMiniMapFallback: boolean
}

export function CanvasViewportControls({
  isMiniMapInteractive,
  locale,
  nodeCount,
  reactFlowInstanceRef,
  shouldRenderMiniMapFallback,
}: CanvasViewportControlsProps) {
  const m = useMessages()
  const viewport = useViewport()
  const [miniMapOpen, setMiniMapOpen] = useState(false)
  const [zoomOpen, setZoomOpen] = useState(false)
  const [isMac, setIsMac] = useState(false)

  useEffect(() => {
    setIsMac(navigator.userAgent.includes('Mac'))
  }, [])

  const cmdKey = isMac ? '⌘' : 'Ctrl'
  const zoomPercent = Math.round(viewport.zoom * 100)
  const zoomLabel = `${zoomPercent}%`
  const [zoomInputValue, setZoomInputValue] = useState(() => String(zoomPercent))
  const setZoomPercent = useCallback((nextPercent: number) => {
    const reactFlow = reactFlowInstanceRef.current
    if (!reactFlow) {
      return
    }
    const clampedPercent = clamp(nextPercent, ZOOM_INPUT_MIN_PERCENT, ZOOM_INPUT_MAX_PERCENT)
    void reactFlow.zoomTo(clampedPercent / 100, { duration: 180 })
  }, [reactFlowInstanceRef])

  useEffect(() => {
    if (zoomOpen) {
      setZoomInputValue(String(zoomPercent))
    }
  }, [zoomOpen, zoomPercent])

  const commitZoomInputValue = useCallback(() => {
    const nextPercent = Number.parseInt(zoomInputValue, 10)
    if (!Number.isFinite(nextPercent)) {
      setZoomInputValue(String(zoomPercent))
      return
    }
    const clampedPercent = clamp(nextPercent, ZOOM_INPUT_MIN_PERCENT, ZOOM_INPUT_MAX_PERCENT)
    setZoomInputValue(String(clampedPercent))
    setZoomPercent(clampedPercent)
  }, [setZoomPercent, zoomInputValue, zoomPercent])
  const setZoomPreset = useCallback((percent: number) => {
    setZoomInputValue(String(percent))
    setZoomPercent(percent)
  }, [setZoomPercent])
  const fitCanvas = useCallback(() => {
    const reactFlow = reactFlowInstanceRef.current
    if (!reactFlow) {
      return
    }
    void reactFlow.fitView({ duration: 220, maxZoom: 1, padding: 0.24 })
  }, [reactFlowInstanceRef])
  const zoomIn = useCallback(() => {
    const reactFlow = reactFlowInstanceRef.current
    if (!reactFlow) {
      return
    }
    void reactFlow.zoomIn({ duration: 160 })
  }, [reactFlowInstanceRef])
  const zoomOut = useCallback(() => {
    const reactFlow = reactFlowInstanceRef.current
    if (!reactFlow) {
      return
    }
    void reactFlow.zoomOut({ duration: 160 })
  }, [reactFlowInstanceRef])

  return (
    <div className="mina-wc-viewport-controls nodrag nowheel nopan" data-mina-canvas-ignore="true">
      {miniMapOpen ? (
        <div className="mina-wc-minimap-frame">
          {shouldRenderMiniMapFallback ? (
            <div className="mina-wc-minimap-fallback" role="status">
              <span className="mina-wc-minimap-fallback-label">{m.workflow_canvas_minimap_suspended()}</span>
              <strong>{formatNumber(nodeCount, locale)}</strong>
              <span>{m.workflow_canvas_nodes()}</span>
            </div>
          ) : (
            <MiniMap
              className="mina-wc-minimap"
              maskColor="color-mix(in oklch, var(--surface-container-lowest) 72%, transparent)"
              nodeColor={getMiniMapNodeColor}
              pannable={isMiniMapInteractive}
              position="top-left"
              style={MINIMAP_STYLE}
              zoomable={isMiniMapInteractive}
            />
          )}
        </div>
      ) : null}
      <div className="mina-wc-viewport-button-stack" role="toolbar" aria-label={m.workflow_canvas_view_controls()}>
        <Tooltip {...(miniMapOpen ? { open: false } : {})}>
          <TooltipTrigger asChild>
            <button
              aria-label={m.workflow_canvas_minimap()}
              aria-pressed={miniMapOpen}
              className="mina-wc-viewport-button"
              data-active={miniMapOpen ? 'true' : undefined}
              onClick={() => setMiniMapOpen((open) => !open)}
              type="button"
            >
              <MapIcon aria-hidden="true" size={16} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={8}>
            {m.workflow_canvas_minimap()}
          </TooltipContent>
        </Tooltip>

        <div className="mina-wc-viewport-divider" />

        <Popover open={zoomOpen} onOpenChange={setZoomOpen}>
          <Tooltip {...(zoomOpen ? { open: false } : {})}>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button
                  aria-label={m.workflow_canvas_zoom_percent()}
                  className="mina-wc-viewport-zoom-button"
                  data-active={zoomOpen ? 'true' : undefined}
                  type="button"
                >
                  {zoomLabel}
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={8}>
              {m.workflow_canvas_zoom_percent()}
            </TooltipContent>
          </Tooltip>
          <PopoverContent
            align="end"
            className="mina-wc-zoom-popover"
            data-mina-canvas-ignore="true"
            side="top"
            sideOffset={12}
          >
            <div className="mina-wc-zoom-input-row">
              <input
                aria-label={m.workflow_canvas_zoom_percent()}
                autoFocus
                className="mina-wc-zoom-input"
                inputMode="numeric"
                max={ZOOM_INPUT_MAX_PERCENT}
                min={ZOOM_INPUT_MIN_PERCENT}
                onBlur={() => setZoomInputValue(String(zoomPercent))}
                onChange={(event) => setZoomInputValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    commitZoomInputValue()
                  }
                  if (event.key === 'Escape') {
                    setZoomInputValue(String(zoomPercent))
                  }
                }}
                type="number"
                value={zoomInputValue}
              />
              <span aria-hidden="true">%</span>
            </div>
            <button className="mina-wc-zoom-menu-item" onClick={zoomIn} type="button">
              <span className="mina-wc-zoom-menu-item-left">
                <Plus aria-hidden="true" size={14} className="mina-wc-zoom-menu-icon" />
                <span>{m.workflow_canvas_zoom_in()}</span>
              </span>
              <Kbd className="mina-wc-zoom-menu-kbd">{cmdKey} +</Kbd>
            </button>
            <button className="mina-wc-zoom-menu-item" onClick={zoomOut} type="button">
              <span className="mina-wc-zoom-menu-item-left">
                <Minus aria-hidden="true" size={14} className="mina-wc-zoom-menu-icon" />
                <span>{m.workflow_canvas_zoom_out()}</span>
              </span>
              <Kbd className="mina-wc-zoom-menu-kbd">{cmdKey} -</Kbd>
            </button>
            <button className="mina-wc-zoom-menu-item" onClick={fitCanvas} type="button">
              <span className="mina-wc-zoom-menu-item-left">
                <Maximize2 aria-hidden="true" size={14} className="mina-wc-zoom-menu-icon" />
                <span>{m.workflow_canvas_fit_screen()}</span>
              </span>
              <Kbd className="mina-wc-zoom-menu-kbd">⇧ F</Kbd>
            </button>
            <div className="mina-wc-zoom-menu-separator" />
            {ZOOM_PERCENT_OPTIONS.map((percent) => {
              const isActive = zoomPercent === percent
              return (
                <button
                  className="mina-wc-zoom-menu-item"
                  data-active={isActive ? 'true' : undefined}
                  key={percent}
                  onClick={() => setZoomPreset(percent)}
                  type="button"
                >
                  <span className="mina-wc-zoom-menu-item-left">
                    <span className="mina-wc-zoom-menu-check-wrapper">
                      {isActive ? <Check aria-hidden="true" size={12} strokeWidth={3} className="mina-wc-zoom-menu-check" /> : null}
                    </span>
                    <span>{m.workflow_canvas_zoom_to({ percent })}</span>
                  </span>
                </button>
              )
            })}
          </PopoverContent>
        </Popover>

        <div className="mina-wc-viewport-divider" />

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={m.workflow_canvas_shortcuts()}
              className="mina-wc-viewport-button"
              type="button"
            >
              <Keyboard aria-hidden="true" size={16} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={8}>
            {m.workflow_canvas_shortcuts()}
          </TooltipContent>
        </Tooltip>

        <div className="mina-wc-viewport-divider" />

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={m.workflow_canvas_help()}
              className="mina-wc-viewport-button"
              type="button"
            >
              <CircleHelp aria-hidden="true" size={16} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={8}>
            {m.workflow_canvas_help()}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
