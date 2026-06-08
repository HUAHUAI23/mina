import { expect, test } from 'bun:test'

import { diffNodeFrames, type NodeFrameSnapshot } from './drag-session'

const frame = (x: number, y: number): NodeFrameSnapshot => ({
  position: { x, y },
})

test('diffNodeFrames reports only changed frames', () => {
  const unchanged = diffNodeFrames({ node_1: frame(10, 20) }, { node_1: frame(10, 20) })
  expect(unchanged).toHaveLength(0)

  const changed = diffNodeFrames({ node_1: frame(10, 20) }, { node_1: frame(15, 25) })
  expect(changed).toHaveLength(1)
  expect(changed[0]?.nodeId).toBe('node_1')
})
