import { useEffect, useRef } from 'react'

export const useCanvasRenderCount = (name: string, id?: string): void => {
  const count = useRef(0)
  count.current += 1

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return
    }
    const suffix = id ? `:${id}` : ''
    console.debug(`[workflow-canvas render] ${name}${suffix}`, count.current)
  })
}
