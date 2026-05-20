import { describe, expect, test } from 'bun:test'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as syncProtocol from 'y-protocols/sync'
import * as Y from 'yjs'

import type { Workflow } from '@mina/contracts/modules/workflows'

import type { WorkflowYjsRoomMessage } from './workflow-yjs-room.service'
import { WorkflowYjsRoomService } from './workflow-yjs-room.service'
import { FakeWorkflowYjsRepository } from '../../../test/fakes'

const messageSync = 0
const messageAwareness = 1
const messageQueryAwareness = 3

class MockConnection {
  closed = false
  readyState: 0 | 1 | 2 | 3 = 1
  received: Uint8Array[] = []

  close(): void {
    this.closed = true
    this.readyState = 3
  }

  send(source: string | ArrayBuffer | Uint8Array): void {
    if (typeof source === 'string') {
      this.received.push(new TextEncoder().encode(source))
      return
    }
    this.received.push(source instanceof Uint8Array ? source : new Uint8Array(source))
  }
}

const workflow: Workflow = {
  accountId: 'account_collab_test',
  createdAt: new Date(0).toISOString(),
  edges: [],
  id: 'workflow_collab_test',
  name: 'Collab',
  nodes: [
    {
      id: 'node_1',
      type: 'text',
      position: { x: 0, y: 0 },
      data: { nodeType: 'text', title: 'Text', config: { text: 'initial' } },
    },
  ],
  updatedAt: new Date(0).toISOString(),
  version: 1,
}

const encodeClientSyncStep1 = (doc: Y.Doc): Uint8Array => {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, messageSync)
  syncProtocol.writeSyncStep1(encoder, doc)
  return encoding.toUint8Array(encoder)
}

const encodeClientUpdate = (update: Uint8Array): Uint8Array => {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, messageSync)
  syncProtocol.writeUpdate(encoder, update)
  return encoding.toUint8Array(encoder)
}

const encodeAwarenessQuery = (): Uint8Array => {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, messageQueryAwareness)
  return encoding.toUint8Array(encoder)
}

const encodeAwarenessUpdateMessage = (
  awareness: awarenessProtocol.Awareness,
  clientIds: number[],
): Uint8Array => {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, messageAwareness)
  encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, clientIds))
  return encoding.toUint8Array(encoder)
}

const readServerMessagesIntoDoc = (doc: Y.Doc, messages: Uint8Array[]): void => {
  for (const message of messages.splice(0)) {
    const decoder = decoding.createDecoder(message)
    const messageType = decoding.readVarUint(decoder)
    if (messageType !== messageSync) {
      continue
    }
    const encoder = encoding.createEncoder()
    syncProtocol.readSyncMessage(decoder, encoder, doc, 'test-client')
  }
}

const binaryMessage = (message: Uint8Array): WorkflowYjsRoomMessage => message

describe('WorkflowYjsRoomService', () => {
  test('syncs yjs updates between two workflow connections and persists updates', async () => {
    const repository = new FakeWorkflowYjsRepository()
    const service = new WorkflowYjsRoomService(repository)
    const first = new MockConnection()
    const second = new MockConnection()
    await service.connect({ connection: first, workflow })
    await service.connect({ connection: second, workflow })

    const firstDoc = new Y.Doc()
    readServerMessagesIntoDoc(firstDoc, first.received)
    await service.handleMessage({
      connection: first,
      message: binaryMessage(encodeClientSyncStep1(firstDoc)),
      workflow,
    })
    readServerMessagesIntoDoc(firstDoc, first.received)

    const secondDoc = new Y.Doc()
    readServerMessagesIntoDoc(secondDoc, second.received)

    firstDoc.getMap('nodes').set('node_1', {
      ...workflow.nodes[0],
      position: { x: 120, y: 80 },
    })
    const update = Y.encodeStateAsUpdate(firstDoc)
    await service.handleMessage({
      connection: first,
      message: binaryMessage(encodeClientUpdate(update)),
      workflow,
    })

    readServerMessagesIntoDoc(secondDoc, second.received)
    const syncedNode = secondDoc.getMap('nodes').get('node_1') as { position: { x: number; y: number } }
    expect(syncedNode.position).toEqual({ x: 120, y: 80 })
    expect(await repository.listUpdates(workflow.id)).toHaveLength(1)
  })

  test('preserves concurrent node frame changes when stale node data arrives', async () => {
    const service = new WorkflowYjsRoomService(new FakeWorkflowYjsRepository())
    const first = new MockConnection()
    await service.connect({ connection: first, workflow })

    const firstDoc = new Y.Doc()
    readServerMessagesIntoDoc(firstDoc, first.received)
    await service.handleMessage({
      connection: first,
      message: binaryMessage(encodeClientSyncStep1(firstDoc)),
      workflow,
    })
    readServerMessagesIntoDoc(firstDoc, first.received)

    firstDoc.getMap('nodeFrames').set('node_1', { position: { x: 320, y: 240 } })
    await service.handleMessage({
      connection: first,
      message: binaryMessage(encodeClientUpdate(Y.encodeStateAsUpdate(firstDoc))),
      workflow,
    })

    firstDoc.getMap('nodes').set('node_1', {
      ...workflow.nodes[0],
      data: { nodeType: 'text', title: 'Changed text', config: { text: 'updated' } },
    })
    await service.handleMessage({
      connection: first,
      message: binaryMessage(encodeClientUpdate(Y.encodeStateAsUpdate(firstDoc))),
      workflow,
    })

    const snapshot = await service.snapshotForWorkflow(workflow)
    const node = snapshot.nodes[0] as { data: { title: string }; position: { x: number; y: number } }
    expect(node.data.title).toBe('Changed text')
    expect(node.position).toEqual({ x: 320, y: 240 })
  })

  test('restores a room from persisted yjs updates after service restart', async () => {
    const repository = new FakeWorkflowYjsRepository()
    const firstService = new WorkflowYjsRoomService(repository)
    const firstConnection = new MockConnection()
    await firstService.connect({ connection: firstConnection, workflow })

    const clientDoc = new Y.Doc()
    readServerMessagesIntoDoc(clientDoc, firstConnection.received)
    await firstService.handleMessage({
      connection: firstConnection,
      message: binaryMessage(encodeClientSyncStep1(clientDoc)),
      workflow,
    })
    readServerMessagesIntoDoc(clientDoc, firstConnection.received)
    clientDoc.getMap('nodeFrames').set('node_1', { position: { x: 240, y: 160 } })
    await firstService.handleMessage({
      connection: firstConnection,
      message: binaryMessage(encodeClientUpdate(Y.encodeStateAsUpdate(clientDoc))),
      workflow,
    })

    const restartedService = new WorkflowYjsRoomService(repository)
    const snapshot = await restartedService.snapshotForWorkflow(workflow)
    const restored = snapshot.nodes[0] as { position: { x: number; y: number } }
    expect(restored.position).toEqual({ x: 240, y: 160 })
  })

  test('checkpoints the current server yjs graph and compacts the persisted snapshot', async () => {
    const repository = new FakeWorkflowYjsRepository()
    const service = new WorkflowYjsRoomService(repository)
    const connection = new MockConnection()
    await service.connect({ connection, workflow })

    const clientDoc = new Y.Doc()
    readServerMessagesIntoDoc(clientDoc, connection.received)
    await service.handleMessage({
      connection,
      message: binaryMessage(encodeClientSyncStep1(clientDoc)),
      workflow,
    })
    readServerMessagesIntoDoc(clientDoc, connection.received)
    clientDoc.getMap('nodeFrames').set('node_1', { position: { x: 410, y: 270 } })
    await service.handleMessage({
      connection,
      message: binaryMessage(encodeClientUpdate(Y.encodeStateAsUpdate(clientDoc))),
      workflow,
    })

    const checkpoint = await service.checkpointForWorkflow(workflow)
    const checkpointNode = checkpoint.nodes[0] as { position: { x: number; y: number } }
    expect(checkpointNode.position).toEqual({ x: 410, y: 270 })
    expect((await repository.getSnapshot(workflow.id))?.version).toBe(workflow.version + 1)
  })

  test('serializes checkpoint compaction and read-model persistence under the workflow lock', async () => {
    const repository = new FakeWorkflowYjsRepository()
    const service = new WorkflowYjsRoomService(repository)
    const connection = new MockConnection()
    await service.connect({ connection, workflow })

    const clientDoc = new Y.Doc()
    readServerMessagesIntoDoc(clientDoc, connection.received)
    await service.handleMessage({
      connection,
      message: binaryMessage(encodeClientSyncStep1(clientDoc)),
      workflow,
    })
    readServerMessagesIntoDoc(clientDoc, connection.received)
    clientDoc.getMap('nodeFrames').set('node_1', { position: { x: 120, y: 220 } })
    await service.handleMessage({
      connection,
      message: binaryMessage(encodeClientUpdate(Y.encodeStateAsUpdate(clientDoc))),
      workflow,
    })

    const persisted: Array<{ nodeX: number; snapshotVersion: number }> = []
    await Promise.all([
      service.checkpointWorkflowReadModel(workflow, async (snapshot) => {
        await Bun.sleep(25)
        const node = snapshot.nodes[0] as { position: { x: number } }
        persisted.push({
          nodeX: node.position.x,
          snapshotVersion: (await repository.getSnapshot(workflow.id))?.version ?? 0,
        })
        return snapshot
      }),
      service.checkpointWorkflowReadModel({ ...workflow, version: 2 }, async (snapshot) => {
        const node = snapshot.nodes[0] as { position: { x: number } }
        persisted.push({
          nodeX: node.position.x,
          snapshotVersion: (await repository.getSnapshot(workflow.id))?.version ?? 0,
        })
        return snapshot
      }),
    ])

    expect(persisted).toEqual([
      { nodeX: 120, snapshotVersion: 2 },
      { nodeX: 120, snapshotVersion: 3 },
    ])
  })

  test('rejects invalid yjs graph during checkpoint validation', async () => {
    const repository = new FakeWorkflowYjsRepository()
    const service = new WorkflowYjsRoomService(repository)
    const connection = new MockConnection()
    await service.connect({ connection, workflow })

    const clientDoc = new Y.Doc()
    readServerMessagesIntoDoc(clientDoc, connection.received)
    await service.handleMessage({
      connection,
      message: binaryMessage(encodeClientSyncStep1(clientDoc)),
      workflow,
    })
    readServerMessagesIntoDoc(clientDoc, connection.received)
    clientDoc.getMap('edges').set('edge_invalid', {
      id: 'edge_invalid',
      type: 'media',
      source: 'node_missing',
      target: 'node_1',
      data: {
        connection: {
          kind: 'media_link',
          targetSlot: 'inputImages',
          targetSlotItemId: 'slot_missing',
        },
      },
    })
    clientDoc.getArray<string>('edgeOrder').push(['edge_invalid'])

    await service.handleMessage({
      connection,
      message: binaryMessage(encodeClientUpdate(Y.encodeStateAsUpdate(clientDoc))),
      workflow,
    })

    expect(await repository.listUpdates(workflow.id)).toHaveLength(1)

    await expect(service.checkpointWorkflowReadModel(workflow, async () => {
      throw new Error('Read model should not be persisted for an invalid graph.')
    })).rejects.toThrow('Workflow edge source and target must exist.')

    const snapshot = await service.snapshotForWorkflow(workflow)
    expect(snapshot.edges).toHaveLength(1)
    expect((await repository.getSnapshot(workflow.id))?.version).toBe(workflow.version)
  })

  test('applies client yjs state update during checkpoint before websocket delivery', async () => {
    const repository = new FakeWorkflowYjsRepository()
    const service = new WorkflowYjsRoomService(repository)
    const connection = new MockConnection()
    await service.connect({ connection, workflow })

    const clientDoc = new Y.Doc()
    readServerMessagesIntoDoc(clientDoc, connection.received)
    await service.handleMessage({
      connection,
      message: binaryMessage(encodeClientSyncStep1(clientDoc)),
      workflow,
    })
    readServerMessagesIntoDoc(clientDoc, connection.received)

    const newNode = {
      id: 'node_unsent',
      type: 'image_generation',
      position: { x: 300, y: 180 },
      width: 240,
      data: {
        nodeType: 'image_generation',
        title: 'Unsent Image',
        config: {
          task: {
            kind: 'image_generation',
            provider: 'dev',
            model: 'dev-image',
            prompt: 'new image',
            params: { count: 1, size: '1024x1024' },
          },
        },
        mediaSlots: {},
      },
    } satisfies Workflow['nodes'][number]
    clientDoc.transact(() => {
      clientDoc.getMap('nodes').set(newNode.id, newNode)
      clientDoc.getMap('nodeFrames').set(newNode.id, {
        position: newNode.position,
        width: newNode.width,
      })
      clientDoc.getArray<string>('nodeOrder').push([newNode.id])
    }, 'test-local-unsent')

    await service.handleMessage({
      connection,
      message: binaryMessage(encodeClientUpdate(Y.encodeStateAsUpdate(clientDoc))),
      workflow,
    })
    const checkpoint = await service.checkpointForWorkflow(workflow)

    expect(checkpoint.nodes.some((node) => node.id === newNode.id)).toBe(true)
    expect(await repository.listUpdates(workflow.id)).toHaveLength(1)
  })

  test('keeps an idle room available for immediate snapshot reloads', async () => {
    const repository = new FakeWorkflowYjsRepository()
    const service = new WorkflowYjsRoomService(repository)
    const connection = new MockConnection()
    const cleanup = await service.connect({ connection, workflow })

    const clientDoc = new Y.Doc()
    readServerMessagesIntoDoc(clientDoc, connection.received)
    await service.handleMessage({
      connection,
      message: binaryMessage(encodeClientSyncStep1(clientDoc)),
      workflow,
    })
    readServerMessagesIntoDoc(clientDoc, connection.received)
    clientDoc.getMap('nodeFrames').set('node_1', { position: { x: 180, y: 140 } })
    await service.handleMessage({
      connection,
      message: binaryMessage(encodeClientUpdate(Y.encodeStateAsUpdate(clientDoc))),
      workflow,
    })

    cleanup()

    const snapshot = await service.snapshotForWorkflow(workflow)
    const restored = snapshot.nodes[0] as { position: { x: number; y: number } }
    expect(restored.position).toEqual({ x: 180, y: 140 })
    expect(snapshot.nodes).toHaveLength(1)
  })

  test('broadcasts awareness updates to peers', async () => {
    const service = new WorkflowYjsRoomService(new FakeWorkflowYjsRepository())
    const first = new MockConnection()
    const second = new MockConnection()
    await service.connect({ connection: first, workflow })
    await service.connect({ connection: second, workflow })
    first.received = []
    second.received = []

    const doc = new Y.Doc()
    const awareness = new awarenessProtocol.Awareness(doc)
    awareness.setLocalState({ user: { id: 'user_1', name: 'User 1', color: '#2563eb' } })
    await service.handleMessage({
      connection: first,
      message: binaryMessage(encodeAwarenessUpdateMessage(awareness, [doc.clientID])),
      workflow,
    })

    expect(second.received.length).toBeGreaterThan(0)
    await service.handleMessage({ connection: second, message: binaryMessage(encodeAwarenessQuery()), workflow })
    expect(second.received.length).toBeGreaterThan(1)
  })
})
