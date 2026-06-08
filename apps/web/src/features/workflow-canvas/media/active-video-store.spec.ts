import { expect, test } from 'bun:test'

import { useActiveVideoStore } from './active-video-store'

test('active video store tracks the currently playing node', () => {
  useActiveVideoStore.setState({ activeNodeId: undefined })
  useActiveVideoStore.getState().play('node_a')
  expect(useActiveVideoStore.getState().activeNodeId).toBe('node_a')

  useActiveVideoStore.getState().play('node_b')
  expect(useActiveVideoStore.getState().activeNodeId).toBe('node_b')
})

test('active video store only clears the active node when that node stops', () => {
  useActiveVideoStore.setState({ activeNodeId: undefined })
  useActiveVideoStore.getState().play('node_a')
  useActiveVideoStore.getState().stop('node_b')
  expect(useActiveVideoStore.getState().activeNodeId).toBe('node_a')

  useActiveVideoStore.getState().stop('node_a')
  expect(useActiveVideoStore.getState().activeNodeId).toBeUndefined()
})
