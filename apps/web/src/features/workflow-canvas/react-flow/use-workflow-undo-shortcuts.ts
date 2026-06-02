import { useEffect } from 'react'

import { useCanvasStore } from '../store/canvas-store'
import { isIgnoredCanvasTarget } from '../utils/canvas-dom-scope'

export const useWorkflowUndoShortcuts = (): void => {
  const redo = useCanvasStore((state) => state.redo)
  const undo = useCanvasStore((state) => state.undo)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) {
        return
      }

      const key = event.key.toLowerCase()
      const isUndo = key === 'z' && !event.shiftKey
      const isRedo = (key === 'z' && event.shiftKey) || (event.ctrlKey && key === 'y')
      if (!isUndo && !isRedo) {
        return
      }

      if (isIgnoredCanvasTarget(event.target)) {
        return
      }

      event.preventDefault()
      if (isRedo) {
        redo()
        return
      }
      undo()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [redo, undo])
}
