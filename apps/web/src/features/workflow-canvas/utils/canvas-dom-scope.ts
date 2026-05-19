const IGNORED_CANVAS_TARGET_SELECTOR = [
  'input',
  'textarea',
  'button',
  'select',
  '[contenteditable="true"]',
  '[data-mina-canvas-ignore="true"]',
  '.nodrag',
  '.nopan',
  '.nowheel',
  '.react-flow__panel',
  '.react-flow__controls',
  '.react-flow__minimap',
].join(', ')

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
