import { useActiveVideoStore } from './active-video-store'

useActiveVideoStore.setState({ activeNodeId: undefined })
useActiveVideoStore.getState().play('node_a')
if (useActiveVideoStore.getState().activeNodeId !== 'node_a') {
  throw new Error('Playing a video should mark that node as active.')
}

useActiveVideoStore.getState().play('node_b')
if (useActiveVideoStore.getState().activeNodeId !== 'node_b') {
  throw new Error('Playing a second video should replace the active node.')
}

useActiveVideoStore.setState({ activeNodeId: undefined })
useActiveVideoStore.getState().play('node_a')
useActiveVideoStore.getState().stop('node_b')
if (useActiveVideoStore.getState().activeNodeId !== 'node_a') {
  throw new Error('Inactive video nodes should not clear the active node.')
}

useActiveVideoStore.getState().stop('node_a')
if (useActiveVideoStore.getState().activeNodeId !== undefined) {
  throw new Error('The active video node should be able to clear itself.')
}

console.log('active-video-store checks passed')
