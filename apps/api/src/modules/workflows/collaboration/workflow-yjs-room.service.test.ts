import { describe, expect, test } from 'bun:test'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as syncProtocol from 'y-protocols/sync'
import * as Y from 'yjs'

import type { Workflow } from '@mina/contracts/modules/workflows'

import {
  createWorkflowYDoc,
  importWorkflowSnapshotToYDoc,
  writeWorkflowNode,
} from './workflow-yjs-document'
import type { WorkflowYjsSnapshotRecord } from './workflow-yjs-repository'
import type { WorkflowYjsRoomMessage } from './workflow-yjs-room.service'
import { WorkflowYjsRoomService } from './workflow-yjs-room.service'
import { FakeWorkflowYjsRepository } from '../../../test/doubles'

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

const saveRepositorySnapshot = async (
  repository: FakeWorkflowYjsRepository,
  input: {
    nodes: Workflow['nodes']
    version: number
    workflowId?: string
  },
): Promise<void> => {
  const workflowId = input.workflowId ?? workflow.id
  const y = createWorkflowYDoc()
  const existing = await repository.getSnapshot(workflowId)
  if (existing) {
    Y.applyUpdate(y.ydoc, existing.snapshotBin, 'test-existing-snapshot')
  } else {
    importWorkflowSnapshotToYDoc(y, { edges: [], nodes: workflow.nodes }, 'test-remote-snapshot')
  }
  const orderedNodeIds = new Set(y.nodeOrder.toArray())
  for (const node of input.nodes) {
    writeWorkflowNode(y.nodes, node)
    y.nodeFrames.set(node.id, {
      position: node.position,
      ...(node.width !== undefined ? { width: node.width } : {}),
      ...(node.height !== undefined ? { height: node.height } : {}),
      ...(node.parentId ? { parentId: node.parentId, extent: 'parent' } : {}),
    })
    if (!orderedNodeIds.has(node.id)) {
      y.nodeOrder.push([node.id])
      orderedNodeIds.add(node.id)
    }
  }
  await repository.saveSnapshot({
    snapshotBin: Y.encodeStateAsUpdate(y.ydoc),
    stateVector: Y.encodeStateVector(y.ydoc),
    version: input.version,
    workflowId,
  })
}

const createInitializedService = async (
  repository = new FakeWorkflowYjsRepository(),
): Promise<{ repository: FakeWorkflowYjsRepository; service: WorkflowYjsRoomService }> => {
  const service = new WorkflowYjsRoomService(repository)
  await service.initializeWorkflow(workflow, {
    edges: workflow.edges,
    nodes: workflow.nodes,
  })
  return { repository, service }
}

class ConflictingSnapshotRepository extends FakeWorkflowYjsRepository {
  conflictNextConditionalSave = false

  override async saveSnapshot(input: WorkflowYjsSnapshotRecord): Promise<boolean> {
    if (this.conflictNextConditionalSave && input.expectedVersion !== undefined) {
      this.conflictNextConditionalSave = false
      await saveRepositorySnapshot(this, {
        nodes: [
          {
            id: 'node_remote',
            type: 'text',
            position: { x: 800, y: 120 },
            data: { nodeType: 'text', title: 'Remote Text', config: { text: 'remote' } },
          },
        ],
        version: input.expectedVersion + 1,
        workflowId: input.workflowId,
      })
    }
    return super.saveSnapshot(input)
  }
}

describe('WorkflowYjsRoomService', () => {
  test('syncs yjs updates between two workflow connections and persists updates', async () => {
    const { repository, service } = await createInitializedService()
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
    const { service } = await createInitializedService()
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
    const { service: firstService } = await createInitializedService(repository)
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

  test('compacts loaded updates after service restart with a new snapshot version', async () => {
    const repository = new FakeWorkflowYjsRepository()
    const { service: firstService } = await createInitializedService(repository)
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
    clientDoc.getMap('nodeFrames').set('node_1', { position: { x: 360, y: 260 } })
    await firstService.handleMessage({
      connection: firstConnection,
      message: binaryMessage(encodeClientUpdate(Y.encodeStateAsUpdate(clientDoc))),
      workflow,
    })

    const restartedService = new WorkflowYjsRoomService(repository)
    const compacted = await restartedService.compactWorkflow(workflow, 'restart_compaction')
    const compactedNode = compacted.nodes[0] as { position: { x: number; y: number } }

    expect(compacted.version).toBe(workflow.version + 1)
    expect(compactedNode.position).toEqual({ x: 360, y: 260 })
    expect(await repository.listUpdates(workflow.id)).toHaveLength(0)
  })

  test('compacts the current server yjs graph into the persisted snapshot', async () => {
    const { repository, service } = await createInitializedService()
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

    const compacted = await service.compactWorkflow(workflow, 'test_compaction')
    const compactedNode = compacted.nodes[0] as { position: { x: number; y: number } }
    expect(compactedNode.position).toEqual({ x: 410, y: 270 })
    expect((await repository.getSnapshot(workflow.id))?.version).toBe(workflow.version + 1)
    expect(await repository.listUpdates(workflow.id)).toHaveLength(0)
  })

  test('rejects explicit compaction when another instance already advanced the snapshot', async () => {
    const { repository, service } = await createInitializedService()
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
    clientDoc.getMap('nodeFrames').set('node_1', { position: { x: 520, y: 310 } })
    await service.handleMessage({
      connection,
      message: binaryMessage(encodeClientUpdate(Y.encodeStateAsUpdate(clientDoc))),
      workflow,
    })

    await saveRepositorySnapshot(repository, {
      nodes: [
        {
          id: 'node_remote',
          type: 'text',
          position: { x: 800, y: 120 },
          data: { nodeType: 'text', title: 'Remote Text', config: { text: 'remote' } },
        },
      ],
      version: workflow.version + 1,
    })

    await expect(service.compactWorkflow(workflow, 'stale_compaction')).rejects.toMatchObject({
      code: 'WORKFLOW_VERSION_CONFLICT',
      status: 409,
    })
    expect((await repository.getSnapshot(workflow.id))?.version).toBe(workflow.version + 1)
    expect(await repository.listUpdates(workflow.id)).toHaveLength(1)

    const snapshot = await service.snapshotForWorkflow({ ...workflow, version: workflow.version + 1 })
    const node = snapshot.nodes.find((item) => item.id === 'node_1') as
      | { position: { x: number; y: number } }
      | undefined
    expect(snapshot.version).toBe(workflow.version + 1)
    expect(snapshot.nodes.some((item) => item.id === 'node_remote')).toBe(true)
    expect(node?.position).toEqual({ x: 520, y: 310 })
  })

  test('keeps update logs when background threshold compaction loses a cross-instance race', async () => {
    const repository = new ConflictingSnapshotRepository()
    const { service } = await createInitializedService(repository)
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

    repository.conflictNextConditionalSave = true
    for (let index = 1; index <= 50; index += 1) {
      clientDoc.getMap('nodeFrames').set('node_1', { position: { x: index, y: 300 + index } })
      await service.handleMessage({
        connection,
        message: binaryMessage(encodeClientUpdate(Y.encodeStateAsUpdate(clientDoc))),
        workflow,
      })
    }

    expect(connection.closed).toBe(false)
    expect((await repository.getSnapshot(workflow.id))?.version).toBe(workflow.version + 1)
    expect(await repository.listUpdates(workflow.id)).toHaveLength(50)

    const snapshot = await service.snapshotForWorkflow({ ...workflow, version: workflow.version + 1 })
    const movedNode = snapshot.nodes.find((node) => node.id === 'node_1') as
      | { position: { x: number; y: number } }
      | undefined
    expect(snapshot.nodes.some((node) => node.id === 'node_remote')).toBe(true)
    expect(movedNode?.position).toEqual({ x: 50, y: 350 })
  })

  test('returns persisted and active room snapshot versions', async () => {
    const { service } = await createInitializedService()
    expect(await service.getSnapshotVersion(workflow.id)).toBe(workflow.version)

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
    clientDoc.getMap('nodeFrames').set('node_1', { position: { x: 460, y: 280 } })
    await service.handleMessage({
      connection,
      message: binaryMessage(encodeClientUpdate(Y.encodeStateAsUpdate(clientDoc))),
      workflow,
    })

    await service.compactWorkflow(workflow, 'version_lookup')
    expect(await service.getSnapshotVersion(workflow.id)).toBe(workflow.version + 1)
  })

  test('serializes compaction under the workflow lock', async () => {
    const { repository, service } = await createInitializedService()
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
      service.compactWorkflow(workflow, 'first').then(async (snapshot) => {
        await Bun.sleep(25)
        const node = snapshot.nodes[0] as { position: { x: number } }
        persisted.push({ nodeX: node.position.x, snapshotVersion: (await repository.getSnapshot(workflow.id))?.version ?? 0 })
      }),
      service.compactWorkflow({ ...workflow, version: 2 }, 'second').then(async (snapshot) => {
        const node = snapshot.nodes[0] as { position: { x: number } }
        persisted.push({ nodeX: node.position.x, snapshotVersion: (await repository.getSnapshot(workflow.id))?.version ?? 0 })
      }),
    ])

    expect(persisted).toEqual([
      { nodeX: 120, snapshotVersion: 2 },
      { nodeX: 120, snapshotVersion: 2 },
    ])
  })

  test('isolates invalid persisted yjs updates during compaction validation', async () => {
    const { repository, service } = await createInitializedService()
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

    const compacted = await service.compactWorkflow(workflow, 'invalid_graph')

    const snapshot = await service.snapshotForWorkflow(workflow)
    expect(compacted.edges).toHaveLength(0)
    expect(snapshot.edges).toHaveLength(0)
    expect((await repository.getSnapshot(workflow.id))?.version).toBe(workflow.version)
    expect(await repository.listUpdates(workflow.id)).toHaveLength(0)
  })

  test('does not broadcast an invalid update rejected by threshold compaction', async () => {
    const { repository, service } = await createInitializedService()
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
    second.received = []

    for (let index = 1; index < 50; index += 1) {
      firstDoc.getMap('nodeFrames').set('node_1', { position: { x: index, y: index } })
      await service.handleMessage({
        connection: first,
        message: binaryMessage(encodeClientUpdate(Y.encodeStateAsUpdate(firstDoc))),
        workflow,
      })
    }

    firstDoc.getMap('edges').set('edge_invalid', {
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
    firstDoc.getArray<string>('edgeOrder').push(['edge_invalid'])
    await service.handleMessage({
      connection: first,
      message: binaryMessage(encodeClientUpdate(Y.encodeStateAsUpdate(firstDoc))),
      workflow,
    })

    const secondDoc = new Y.Doc()
    readServerMessagesIntoDoc(secondDoc, second.received)
    expect(secondDoc.getMap('edges').has('edge_invalid')).toBe(false)
    expect(await repository.listUpdates(workflow.id)).toHaveLength(0)
    expect((await repository.getSnapshot(workflow.id))?.version).toBe(workflow.version + 1)
  })

  test('applies client yjs state update during compaction before websocket delivery', async () => {
    const { repository, service } = await createInitializedService()
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
    const compacted = await service.compactWorkflow(workflow, 'unsent_update')

    expect(compacted.nodes.some((node) => node.id === newNode.id)).toBe(true)
    expect(await repository.listUpdates(workflow.id)).toHaveLength(0)
  })

  test('keeps an idle room available for immediate snapshot reloads', async () => {
    const { service } = await createInitializedService()
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
    const { service } = await createInitializedService()
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
