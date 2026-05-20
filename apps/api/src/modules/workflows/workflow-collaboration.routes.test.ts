import { describe, expect, test } from 'bun:test'
import { websocket } from 'hono/bun'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as syncProtocol from 'y-protocols/sync'
import * as Y from 'yjs'

import { createTestApp } from '../../test/app'

const messageSync = 0
const messageAwareness = 1

const textEncoder = new TextEncoder()

const node = {
  id: 'node_1',
  type: 'text',
  position: { x: 0, y: 0 },
  data: { nodeType: 'text', title: 'Text', config: { text: 'initial' } },
}

const connectedNode = {
  id: 'node_2',
  type: 'image_generation',
  position: { x: 420, y: 0 },
  data: {
    nodeType: 'image_generation',
    title: 'Image',
    config: {
      task: {
        kind: 'image_generation',
        provider: 'dev',
        model: 'dev-image',
        prompt: 'initial image',
        params: {
          count: 1,
          size: '1024x1024',
        },
      },
    },
    mediaSlots: {
      image: [
        {
          id: 'slot_item_1',
          order: 0,
          required: true,
          slot: 'image',
          source: {
            type: 'node_output',
            nodeId: 'node_1',
            resolve: 'current_media',
          },
        },
      ],
    },
  },
}

const edge = {
  id: 'edge_1',
  type: 'media',
  source: 'node_1',
  target: 'node_2',
  data: {
    connection: {
      kind: 'media_link',
      targetSlot: 'image',
      targetSlotItemId: 'slot_item_1',
    },
  },
}

const toUint8Array = async (value: unknown): Promise<Uint8Array> => {
  if (typeof value === 'string') {
    return textEncoder.encode(value)
  }
  if (value instanceof Uint8Array) {
    return new Uint8Array(value)
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value)
  }
  if (value instanceof Blob) {
    return new Uint8Array(await value.arrayBuffer())
  }
  if (value && typeof value === 'object' && 'buffer' in value) {
    return new Uint8Array((value as { buffer: ArrayBufferLike }).buffer)
  }
  throw new Error('Unsupported WebSocket message payload.')
}

const createMessageCollector = (socket: WebSocket): Uint8Array[] => {
  const messages: Uint8Array[] = []
  socket.binaryType = 'arraybuffer'
  socket.addEventListener('message', (event) => {
    void toUint8Array(event.data).then((message) => messages.push(message))
  })
  return messages
}

const waitFor = async (predicate: () => boolean): Promise<void> => {
  const startedAt = Date.now()
  while (!predicate()) {
    if (Date.now() - startedAt > 2_000) {
      throw new Error('Timed out waiting for collaboration test condition.')
    }
    await Bun.sleep(10)
  }
}

const waitForOpen = (socket: WebSocket): Promise<void> =>
  new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true })
    socket.addEventListener('error', () => reject(new Error('WebSocket connection failed.')), { once: true })
  })

const readAuthToken = (value: unknown): string => {
  if (
    value &&
    typeof value === 'object' &&
    'session' in value &&
    value.session &&
    typeof value.session === 'object' &&
    'token' in value.session &&
    typeof value.session.token === 'string'
  ) {
    return value.session.token
  }
  throw new Error('Registration response did not include a session token.')
}

const readWorkflowId = (value: unknown): string => {
  if (
    value &&
    typeof value === 'object' &&
    'item' in value &&
    value.item &&
    typeof value.item === 'object' &&
    'id' in value.item &&
    typeof value.item.id === 'string'
  ) {
    return value.item.id
  }
  throw new Error('Workflow response did not include a workflow id.')
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
    syncProtocol.readSyncMessage(decoder, encoder, doc, 'route-test-client')
  }
}

const waitForSyncedDoc = async (
  doc: Y.Doc,
  messages: Uint8Array[],
  predicate: () => boolean,
): Promise<void> => {
  await waitFor(() => {
    readServerMessagesIntoDoc(doc, messages)
    return predicate()
  })
}

const readAwarenessMessages = (
  awareness: awarenessProtocol.Awareness,
  messages: Uint8Array[],
): void => {
  for (const message of messages.splice(0)) {
    const decoder = decoding.createDecoder(message)
    const messageType = decoding.readVarUint(decoder)
    if (messageType !== messageAwareness) {
      continue
    }
    awarenessProtocol.applyAwarenessUpdate(
      awareness,
      decoding.readVarUint8Array(decoder),
      'route-test-client',
    )
  }
}

const sendLocalTransaction = (socket: WebSocket, doc: Y.Doc, mutate: () => void): void => {
  const updates: Uint8Array[] = []
  const onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === 'route-test-local') {
      updates.push(update)
    }
  }
  doc.on('update', onUpdate)
  doc.transact(mutate, 'route-test-local')
  doc.off('update', onUpdate)
  socket.send(encodeClientUpdate(updates.length === 1 ? updates[0]! : Y.mergeUpdates(updates)))
}

describe('workflow collaboration routes', () => {
  test('syncs yjs document and awareness across authenticated websocket clients', async () => {
    const app = createTestApp()
    const registerResponse = await app.request('/api/auth/register', {
      body: JSON.stringify({
        email: 'collab-route@example.com',
        password: 'correct horse battery staple',
        username: 'collab_route',
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })
    const token = readAuthToken(await registerResponse.json())
    const createWorkflowResponse = await app.request('/api/workflows', {
      body: JSON.stringify({ edges: [], name: 'Collab route', nodes: [node] }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
    const workflowId = readWorkflowId(await createWorkflowResponse.json())
    const server = Bun.serve({ fetch: app.fetch, port: 0, websocket })

    try {
      const roomUrl = `ws://127.0.0.1:${server.port}/api/workflows/${workflowId}/collab/${workflowId}?token=${token}`
      const firstSocket = new WebSocket(roomUrl)
      const secondSocket = new WebSocket(roomUrl)
      const firstMessages = createMessageCollector(firstSocket)
      const secondMessages = createMessageCollector(secondSocket)
      await Promise.all([waitForOpen(firstSocket), waitForOpen(secondSocket)])
      await waitFor(() => firstMessages.length > 0 && secondMessages.length > 0)

      const firstDoc = new Y.Doc()
      const secondDoc = new Y.Doc()
      readServerMessagesIntoDoc(firstDoc, firstMessages)
      readServerMessagesIntoDoc(secondDoc, secondMessages)
      firstSocket.send(encodeClientSyncStep1(firstDoc))
      secondSocket.send(encodeClientSyncStep1(secondDoc))
      await waitFor(() => firstMessages.length > 0 && secondMessages.length > 0)
      readServerMessagesIntoDoc(firstDoc, firstMessages)
      readServerMessagesIntoDoc(secondDoc, secondMessages)

      sendLocalTransaction(firstSocket, firstDoc, () => {
        firstDoc.getMap('nodes').set('node_1', {
          ...node,
          position: { x: 360, y: 180 },
        })
      })
      await waitForSyncedDoc(secondDoc, secondMessages, () => {
        const candidate = secondDoc.getMap('nodes').get('node_1') as { position?: { x: number; y: number } } | undefined
        return candidate?.position?.x === 360 && candidate.position.y === 180
      })
      const syncedNode = secondDoc.getMap('nodes').get('node_1') as { position: { x: number; y: number } }
      expect(syncedNode.position).toEqual({ x: 360, y: 180 })

      sendLocalTransaction(firstSocket, firstDoc, () => {
        firstDoc.getMap('nodes').set('node_2', connectedNode)
        firstDoc.getArray<string>('nodeOrder').push(['node_2'])
        firstDoc.getMap('edges').set('edge_1', edge)
        firstDoc.getArray<string>('edgeOrder').push(['edge_1'])
      })
      await waitForSyncedDoc(secondDoc, secondMessages, () =>
        secondDoc.getMap('nodes').has('node_2') && secondDoc.getMap('edges').has('edge_1'),
      )
      expect(secondDoc.getMap('nodes').has('node_2')).toBe(true)
      expect(secondDoc.getMap('edges').has('edge_1')).toBe(true)

      sendLocalTransaction(secondSocket, secondDoc, () => {
        secondDoc.getMap('nodes').set('node_2', {
          ...connectedNode,
          position: { x: 520, y: 240 },
          data: {
            ...connectedNode.data,
            config: {
              task: {
                ...connectedNode.data.config.task,
                prompt: 'edited prompt',
              },
            },
          },
        })
      })
      await waitForSyncedDoc(firstDoc, firstMessages, () => {
        const candidate = firstDoc.getMap('nodes').get('node_2') as
          | { data?: { config?: { task?: { prompt?: string } } }; position?: { x: number; y: number } }
          | undefined
        return (
          candidate?.position?.x === 520 &&
          candidate.position.y === 240 &&
          candidate.data?.config?.task?.prompt === 'edited prompt'
        )
      })
      const editedNode = firstDoc.getMap('nodes').get('node_2') as {
        data: { config: { task: { prompt: string } } }
        position: { x: number; y: number }
      }
      expect(editedNode.position).toEqual({ x: 520, y: 240 })
      expect(editedNode.data.config.task.prompt).toBe('edited prompt')

      sendLocalTransaction(firstSocket, firstDoc, () => {
        firstDoc.getMap('nodes').set('node_1', {
          ...node,
          position: { x: 600, y: 100 },
        })
      })
      await waitForSyncedDoc(secondDoc, secondMessages, () => {
        const candidate = secondDoc.getMap('nodes').get('node_1') as { position?: { x: number; y: number } } | undefined
        return candidate?.position?.x === 600 && candidate.position.y === 100
      })
      sendLocalTransaction(secondSocket, secondDoc, () => {
        secondDoc.getMap('nodes').set('node_1', {
          ...node,
          position: { x: 720, y: 260 },
        })
      })
      await waitForSyncedDoc(firstDoc, firstMessages, () => {
        const candidate = firstDoc.getMap('nodes').get('node_1') as { position?: { x: number; y: number } } | undefined
        return candidate?.position?.x === 720 && candidate.position.y === 260
      })
      const conflictNode = firstDoc.getMap('nodes').get('node_1') as { position: { x: number; y: number } }
      expect(conflictNode.position).toEqual({ x: 720, y: 260 })

      sendLocalTransaction(secondSocket, secondDoc, () => {
        secondDoc.getMap('nodes').delete('node_2')
        const node2Index = secondDoc.getArray<string>('nodeOrder').toArray().indexOf('node_2')
        if (node2Index >= 0) {
          secondDoc.getArray<string>('nodeOrder').delete(node2Index, 1)
        }
        secondDoc.getMap('edges').delete('edge_1')
        const edgeIndex = secondDoc.getArray<string>('edgeOrder').toArray().indexOf('edge_1')
        if (edgeIndex >= 0) {
          secondDoc.getArray<string>('edgeOrder').delete(edgeIndex, 1)
        }
      })
      await waitForSyncedDoc(firstDoc, firstMessages, () =>
        !firstDoc.getMap('nodes').has('node_2') && !firstDoc.getMap('edges').has('edge_1'),
      )
      expect(firstDoc.getMap('nodes').has('node_2')).toBe(false)
      expect(firstDoc.getMap('edges').has('edge_1')).toBe(false)

      secondSocket.close()
      const reconnectedSocket = new WebSocket(roomUrl)
      const reconnectedMessages = createMessageCollector(reconnectedSocket)
      await waitForOpen(reconnectedSocket)
      await waitFor(() => reconnectedMessages.length > 0)
      const reconnectedDoc = new Y.Doc()
      readServerMessagesIntoDoc(reconnectedDoc, reconnectedMessages)
      reconnectedSocket.send(encodeClientSyncStep1(reconnectedDoc))
      await waitForSyncedDoc(reconnectedDoc, reconnectedMessages, () => {
        const candidate = reconnectedDoc.getMap('nodes').get('node_1') as
          | { position?: { x: number; y: number } }
          | undefined
        return candidate?.position?.x === 720 && candidate.position.y === 260
      })
      const reconnectedNode = reconnectedDoc.getMap('nodes').get('node_1') as { position: { x: number; y: number } }
      expect(reconnectedNode.position).toEqual({ x: 720, y: 260 })
      expect(reconnectedDoc.getMap('nodes').has('node_2')).toBe(false)

      const firstAwarenessDoc = new Y.Doc()
      const reconnectedAwareness = new awarenessProtocol.Awareness(new Y.Doc())
      const firstAwareness = new awarenessProtocol.Awareness(firstAwarenessDoc)
      firstAwareness.setLocalState({
        user: { id: 'user_1', name: 'User 1', color: '#2563eb' },
        selection: { edgeIds: [], nodeIds: ['node_1'] },
      })
      firstSocket.send(encodeAwarenessUpdateMessage(firstAwareness, [firstAwarenessDoc.clientID]))
      await waitFor(() => {
        readAwarenessMessages(reconnectedAwareness, reconnectedMessages)
        return Array.from(reconnectedAwareness.getStates().values()).some(
          (state) =>
            Boolean(state) &&
            typeof state === 'object' &&
            'user' in state &&
            (state as { user?: { id?: string } }).user?.id === 'user_1',
        )
      })
      const remoteStates = Array.from(reconnectedAwareness.getStates().values())
      expect(remoteStates).toContainEqual({
        user: { id: 'user_1', name: 'User 1', color: '#2563eb' },
        selection: { edgeIds: [], nodeIds: ['node_1'] },
      })

      firstSocket.close()
      reconnectedSocket.close()
    } finally {
      server.stop(true)
    }
  })
})
