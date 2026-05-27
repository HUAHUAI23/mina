import { useCallback, useEffect, useRef } from 'react'

import { POINTER_BACKGROUND_GEOMETRY } from './pointer-background-geometry'

export const usePointerBackground = () => {
  const pointerFrameRef = useRef<number | undefined>(undefined)
  const pointerSettleTimerRef = useRef<ReturnType<typeof window.setTimeout> | undefined>(undefined)

  useEffect(
    () => () => {
      if (pointerFrameRef.current !== undefined) {
        window.cancelAnimationFrame(pointerFrameRef.current)
      }
      if (pointerSettleTimerRef.current !== undefined) {
        window.clearTimeout(pointerSettleTimerRef.current)
      }
    },
    [],
  )

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const target = event.currentTarget
    const rect = target.getBoundingClientRect()
    const pointerX = event.clientX - rect.left
    const pointerY = event.clientY - rect.top

    if (pointerFrameRef.current !== undefined) {
      window.cancelAnimationFrame(pointerFrameRef.current)
    }

    pointerFrameRef.current = window.requestAnimationFrame(() => {
      target.style.setProperty('--mina-canvas-pointer-x', `${pointerX}px`)
      target.style.setProperty('--mina-canvas-pointer-y', `${pointerY}px`)
      target.setAttribute('data-pointer-active', 'true')
      pointerFrameRef.current = undefined
    })

    if (pointerSettleTimerRef.current !== undefined) {
      window.clearTimeout(pointerSettleTimerRef.current)
    }
    pointerSettleTimerRef.current = window.setTimeout(() => {
      target.removeAttribute('data-pointer-active')
      pointerSettleTimerRef.current = undefined
    }, POINTER_BACKGROUND_GEOMETRY.highlightSettleMs)
  }, [])

  const handlePointerLeave = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (pointerFrameRef.current !== undefined) {
      window.cancelAnimationFrame(pointerFrameRef.current)
      pointerFrameRef.current = undefined
    }
    if (pointerSettleTimerRef.current !== undefined) {
      window.clearTimeout(pointerSettleTimerRef.current)
      pointerSettleTimerRef.current = undefined
    }
    event.currentTarget.removeAttribute('data-pointer-active')
  }, [])

  return {
    onPointerLeave: handlePointerLeave,
    onPointerMove: handlePointerMove,
  }
}
