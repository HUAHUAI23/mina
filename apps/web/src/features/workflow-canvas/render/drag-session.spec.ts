import { diffNodeFrames, type NodeFrameSnapshot } from './drag-session'

const frame = (x: number, y: number): NodeFrameSnapshot => ({
  position: { x, y },
})

const unchanged = diffNodeFrames({ node_1: frame(10, 20) }, { node_1: frame(10, 20) })
if (unchanged.length !== 0) {
  throw new Error(`Expected no frame changes, received ${unchanged.length}.`)
}

const changed = diffNodeFrames({ node_1: frame(10, 20) }, { node_1: frame(15, 25) })
if (changed.length !== 1 || changed[0]?.nodeId !== 'node_1') {
  throw new Error('Expected one changed node frame.')
}

console.log('drag-session diffNodeFrames checks passed')
