const IGNORED_CANVAS_TARGET_SELECTOR = [
  'input',
  'textarea',
  'button',
  'select',
  '[contenteditable="true"]',
  '[data-mina-canvas-ignore="true"]',
  '.react-flow__handle',
  '.react-flow__panel',
  '.react-flow__controls',
  '.react-flow__minimap',
].join(', ')

const CANVAS_SCOPE_SELECTOR = '[data-mina-canvas-scope-id]'

export type CanvasDomScope =
  | {
      scope: 'root'
      scopeNodeId?: undefined
    }
  | {
      scope: 'flow_group' | 'node_group'
      scopeNodeId: string
    }

const asHTMLElement = (target: EventTarget | null): HTMLElement | null =>
  target instanceof HTMLElement ? target : null

export const isIgnoredCanvasTarget = (target: EventTarget | null): boolean => {
  const element = asHTMLElement(target)
  return Boolean(element?.closest(IGNORED_CANVAS_TARGET_SELECTOR))
}

export const isReactFlowPaneTarget = (target: EventTarget | null): boolean => {
  const element = asHTMLElement(target)
  return Boolean(element?.classList.contains('react-flow__pane'))
}

export const resolveCanvasDomScope = (target: EventTarget | null): CanvasDomScope | undefined => {
  const element = asHTMLElement(target)
  if (!element || isIgnoredCanvasTarget(element)) {
    return undefined
  }

  const scopedElement = element.closest<HTMLElement>(CANVAS_SCOPE_SELECTOR)
  if (scopedElement) {
    const scope = scopedElement.dataset.minaCanvasScope
    const scopeNodeId = scopedElement.dataset.minaCanvasScopeId
    if ((scope === 'flow_group' || scope === 'node_group') && scopeNodeId) {
      return { scope, scopeNodeId }
    }
    return undefined
  }

  if (element.closest('.react-flow__node, .react-flow__edge, .react-flow__nodesselection')) {
    return undefined
  }

  return isReactFlowPaneTarget(element) ? { scope: 'root' } : undefined
}
