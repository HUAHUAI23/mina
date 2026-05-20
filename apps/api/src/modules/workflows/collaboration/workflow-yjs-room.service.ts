import * as awarenessProtocol from 'y-protocols/awareness'
import * as syncProtocol from 'y-protocols/sync'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as Y from 'yjs'

import type { Workflow } from '@mina/contracts/modules/workflows'

import {
  createWorkflowYDoc,
  exportWorkflowSnapshotFromYDoc,
  importWorkflowSnapshotToYDoc,
  type WorkflowYDocHandles,
} from './workflow-yjs-document'
import type { WorkflowYjsRepository } from './workflow-yjs-repository'
import { validateCanvas } from '../validation'

const messageSync = 0
const messageAwareness = 1
const messageQueryAwareness = 3
const snapshotCompactionThreshold = 50
const maxMessageBytes = 2 * 1024 * 1024
const roomIdleCleanupMs = 30_000

export type WorkflowYjsRoomMessage = string | Blob | ArrayBufferLike | Uint8Array

type WorkflowRoomConnection = {
  close(code?: number, reason?: string): void
  readyState: number
  send(source: string | ArrayBuffer | Uint8Array): void
}

interface WorkflowCollaborationRoom {
  awareness: awarenessProtocol.Awareness
  cleanupTimer: ReturnType<typeof setTimeout> | undefined
  connections: Set<WorkflowRoomConnection>
  persistedUpdatesSinceSnapshot: number
  snapshotVersion: number
  y: WorkflowYDocHandles
  workflowId: string
}

const createId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`

const toUint8Array = async (value: WorkflowYjsRoomMessage): Promise<Uint8Array> => {
  if (typeof value === 'string') {
    return new TextEncoder().encode(value)
  }
  if (value instanceof Uint8Array) {
    return new Uint8Array(value)
  }
  if (value instanceof Blob) {
    return new Uint8Array(await value.arrayBuffer())
  }
  return new Uint8Array(value)
}

const sendBinary = (connection: WorkflowRoomConnection, data: Uint8Array): void => {
  if (connection.readyState === 1) {
    connection.send(new Uint8Array(data))
  }
}

const encodeSyncStep1 = (doc: Y.Doc): Uint8Array => {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, messageSync)
  syncProtocol.writeSyncStep1(encoder, doc)
  return encoding.toUint8Array(encoder)
}

const encodeSyncUpdate = (update: Uint8Array): Uint8Array => {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, messageSync)
  syncProtocol.writeUpdate(encoder, update)
  return encoding.toUint8Array(encoder)
}

const readSyncMessage = (
  decoder: decoding.Decoder,
  encoder: encoding.Encoder,
  doc: Y.Doc,
): { syncMessageType: number; update?: Uint8Array | undefined } => {
  const syncMessageType = decoding.readVarUint(decoder)
  if (syncMessageType === syncProtocol.messageYjsSyncStep1) {
    syncProtocol.readSyncStep1(decoder, encoder, doc)
    return { syncMessageType }
  }
  if (syncMessageType === syncProtocol.messageYjsSyncStep2) {
    const update = decoding.readVarUint8Array(decoder)
    return { syncMessageType, update }
  }
  if (syncMessageType === syncProtocol.messageYjsUpdate) {
    const update = decoding.readVarUint8Array(decoder)
    return { syncMessageType, update }
  }
  throw new Error('Unknown Yjs sync message type.')
}

const encodeAwareness = (
  awareness: awarenessProtocol.Awareness,
  clientIds: number[],
): Uint8Array => {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, messageAwareness)
  encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, clientIds))
  return encoding.toUint8Array(encoder)
}

const broadcast = (
  room: WorkflowCollaborationRoom,
  data: Uint8Array,
  except?: WorkflowRoomConnection,
): void => {
  for (const connection of room.connections) {
    if (connection !== except) {
      sendBinary(connection, data)
    }
  }
}

export class WorkflowYjsRoomService {
  readonly #rooms = new Map<string, Promise<WorkflowCollaborationRoom>>()
  readonly #workflowLocks = new Map<string, Promise<void>>()

  constructor(private readonly repository: WorkflowYjsRepository) {}

  async connect(input: {
    connection: WorkflowRoomConnection
    workflow: Workflow
  }): Promise<() => void> {
    const room = await this.#getRoom(input.workflow)
    this.#clearRoomCleanup(room)
    room.connections.add(input.connection)

    sendBinary(input.connection, encodeSyncStep1(room.y.ydoc))
    if (room.awareness.getStates().size > 0) {
      sendBinary(input.connection, encodeAwareness(room.awareness, Array.from(room.awareness.getStates().keys())))
    }

    return () => {
      room.connections.delete(input.connection)
      if (room.connections.size === 0) {
        this.#scheduleRoomCleanup(room)
      }
    }
  }

  exportSnapshot(workflowId: string): { edges: unknown[]; nodes: unknown[] } | undefined {
    const roomPromise = this.#rooms.get(workflowId)
    if (!roomPromise) {
      return undefined
    }
    let snapshot: { edges: unknown[]; nodes: unknown[] } | undefined
    void roomPromise.then((room) => {
      snapshot = exportWorkflowSnapshotFromYDoc(room.y)
    })
    return snapshot
  }

  async handleMessage(input: {
    connection: WorkflowRoomConnection
    message: WorkflowYjsRoomMessage
    workflow: Workflow
  }): Promise<void> {
    const message = await toUint8Array(input.message)
    if (message.byteLength > maxMessageBytes) {
      input.connection.close(1009, 'Yjs update exceeds room message limit.')
      return
    }

    const room = await this.#getRoom(input.workflow)
    const decoder = decoding.createDecoder(message)
    const encoder = encoding.createEncoder()
    const messageType = decoding.readVarUint(decoder)

    if (messageType === messageSync) {
      encoding.writeVarUint(encoder, messageSync)
      const { syncMessageType, update } = readSyncMessage(decoder, encoder, room.y.ydoc)
      if (encoding.length(encoder) > 1) {
        sendBinary(input.connection, encoding.toUint8Array(encoder))
      }
      if (
        (syncMessageType === syncProtocol.messageYjsUpdate ||
          syncMessageType === syncProtocol.messageYjsSyncStep2) &&
        update &&
        update.byteLength > 0
      ) {
        await this.#withWorkflowLock(room.workflowId, async () => {
          await this.#persistUpdate(room, update)
          Y.applyUpdate(room.y.ydoc, update, input.connection)
        })
        broadcast(room, encodeSyncUpdate(update), input.connection)
      }
      return
    }

    if (messageType === messageQueryAwareness) {
      sendBinary(input.connection, encodeAwareness(room.awareness, Array.from(room.awareness.getStates().keys())))
      return
    }

    if (messageType === messageAwareness) {
      const update = decoding.readVarUint8Array(decoder)
      awarenessProtocol.applyAwarenessUpdate(room.awareness, update, input.connection)
      broadcast(room, message, input.connection)
    }
  }

  async snapshotForWorkflow(workflow: Workflow): Promise<{
    edges: unknown[]
    nodes: unknown[]
    version: number
    workflowId: string
  }> {
    const room = await this.#getRoom(workflow)
    this.#clearRoomCleanup(room)
    const snapshot = exportWorkflowSnapshotFromYDoc(room.y)
    if (room.connections.size === 0) {
      this.#scheduleRoomCleanup(room)
    }
    return {
      ...snapshot,
      version: workflow.version,
      workflowId: workflow.id,
    }
  }

  async checkpointForWorkflow(
    workflow: Workflow,
  ): Promise<{
    edges: Workflow['edges']
    nodes: Workflow['nodes']
    yjsStateVector: Uint8Array
  }> {
    return this.checkpointWorkflowReadModel(workflow, async (snapshot) => snapshot)
  }

  async checkpointWorkflowReadModel<T>(
    workflow: Workflow,
    persistReadModel: (snapshot: {
      edges: Workflow['edges']
      nodes: Workflow['nodes']
      yjsStateVector: Uint8Array
    }) => Promise<T>,
  ): Promise<T> {
    const room = await this.#getRoom(workflow)
    this.#clearRoomCleanup(room)
    const result = await this.#withWorkflowLock(workflow.id, async () => {
      const snapshot = exportWorkflowSnapshotFromYDoc(room.y)
      validateCanvas(snapshot.nodes, snapshot.edges)
      const stateVector = Y.encodeStateVector(room.y.ydoc)
      const nextSnapshotVersion = Math.max(room.snapshotVersion + 1, workflow.version + 1)
      await this.repository.saveSnapshot({
        snapshotBin: Y.encodeStateAsUpdate(room.y.ydoc),
        stateVector,
        version: nextSnapshotVersion,
        workflowId: workflow.id,
      })
      room.persistedUpdatesSinceSnapshot = 0
      room.snapshotVersion = nextSnapshotVersion
      return persistReadModel({ ...snapshot, yjsStateVector: stateVector })
    })
    if (room.connections.size === 0) {
      this.#scheduleRoomCleanup(room)
    }
    return result
  }

  async #getRoom(workflow: Workflow): Promise<WorkflowCollaborationRoom> {
    const existing = this.#rooms.get(workflow.id)
    if (existing) {
      return existing
    }
    const created = this.#createRoom(workflow)
    this.#rooms.set(workflow.id, created)
    return created
  }

  async #createRoom(workflow: Workflow): Promise<WorkflowCollaborationRoom> {
    const y = createWorkflowYDoc()
    const persistedSnapshot = await this.repository.getSnapshot(workflow.id)
    if (persistedSnapshot) {
      Y.applyUpdate(y.ydoc, persistedSnapshot.snapshotBin, 'mina-server-load')
      const updates = await this.repository.listUpdates(workflow.id)
      for (const update of updates) {
        Y.applyUpdate(y.ydoc, update.updateBin, 'mina-server-load')
      }
    } else {
      importWorkflowSnapshotToYDoc(y, { edges: workflow.edges, nodes: workflow.nodes })
      await this.repository.saveSnapshot({
        snapshotBin: Y.encodeStateAsUpdate(y.ydoc),
        stateVector: Y.encodeStateVector(y.ydoc),
        version: workflow.version,
        workflowId: workflow.id,
      })
    }

    const room: WorkflowCollaborationRoom = {
      awareness: new awarenessProtocol.Awareness(y.ydoc),
      cleanupTimer: undefined,
      connections: new Set(),
      persistedUpdatesSinceSnapshot: 0,
      snapshotVersion: persistedSnapshot?.version ?? workflow.version,
      workflowId: workflow.id,
      y,
    }
    room.awareness.setLocalState(null)
    return room
  }

  #clearRoomCleanup(room: WorkflowCollaborationRoom): void {
    if (!room.cleanupTimer) {
      return
    }
    clearTimeout(room.cleanupTimer)
    room.cleanupTimer = undefined
  }

  #scheduleRoomCleanup(room: WorkflowCollaborationRoom): void {
    if (room.cleanupTimer) {
      return
    }
    room.cleanupTimer = setTimeout(() => {
      void this.#rooms.get(room.workflowId)?.then((currentRoom) => {
        if (currentRoom !== room || room.connections.size > 0) {
          return
        }
        room.awareness.destroy()
        room.y.ydoc.destroy()
        this.#rooms.delete(room.workflowId)
      })
    }, roomIdleCleanupMs)
    ;(room.cleanupTimer as { unref?: () => void }).unref?.()
  }

  async #persistUpdate(room: WorkflowCollaborationRoom, update: Uint8Array): Promise<void> {
    await this.repository.appendUpdate({
      id: createId('workflow_yjs_update'),
      updateBin: update,
      workflowId: room.workflowId,
    })
    room.persistedUpdatesSinceSnapshot += 1
    if (room.persistedUpdatesSinceSnapshot >= snapshotCompactionThreshold) {
      await this.repository.saveSnapshot({
        snapshotBin: Y.encodeStateAsUpdate(room.y.ydoc),
        stateVector: Y.encodeStateVector(room.y.ydoc),
        version: room.snapshotVersion + 1,
        workflowId: room.workflowId,
      })
      room.persistedUpdatesSinceSnapshot = 0
      room.snapshotVersion += 1
    }
  }

  async #withWorkflowLock<T>(workflowId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.#workflowLocks.get(workflowId) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    const chained = previous.then(() => current)
    this.#workflowLocks.set(workflowId, chained)
    await previous
    try {
      return await task()
    } finally {
      release()
      if (this.#workflowLocks.get(workflowId) === chained) {
        this.#workflowLocks.delete(workflowId)
      }
    }
  }
}
