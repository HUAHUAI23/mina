import * as awarenessProtocol from 'y-protocols/awareness'
import * as syncProtocol from 'y-protocols/sync'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as Y from 'yjs'

import type { Workflow, WorkflowSummary } from '@mina/contracts/modules/workflows'

import {
  createWorkflowYDoc,
  exportWorkflowSnapshotFromYDoc,
  importWorkflowSnapshotToYDoc,
  type WorkflowYDocHandles,
} from './workflow-yjs-document'
import { appLogger, type AppLogger } from '../../../lib/logger/logger'
import type { WorkflowYjsRepository } from './workflow-yjs-repository'
import { validateCanvas } from '../validation'
import { normalizeWorkflowEdge, normalizeWorkflowNode } from '../repositories/workflow-mappers'

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

export interface WorkflowYjsSnapshot {
  edges: Workflow['edges']
  nodes: Workflow['nodes']
  version: number
  workflowId: string
  yjsStateVector: Uint8Array
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

const normalizeSnapshot = (snapshot: {
  edges: unknown[]
  nodes: unknown[]
}): Pick<WorkflowYjsSnapshot, 'edges' | 'nodes'> => ({
  edges: snapshot.edges.map((edge) => normalizeWorkflowEdge(edge as Workflow['edges'][number])),
  nodes: snapshot.nodes.map((node) => normalizeWorkflowNode(node as Workflow['nodes'][number])),
})

interface WorkflowYjsRoomServiceOptions {
  onSnapshotSaved?: (input: {
    reason: string
    timestamp: string
    version: number
    workflowId: string
  }) => Promise<void> | void
}

export class WorkflowYjsRoomService {
  readonly #rooms = new Map<string, Promise<WorkflowCollaborationRoom>>()
  readonly #workflowLocks = new Map<string, Promise<void>>()

  constructor(
    private readonly repository: WorkflowYjsRepository,
    private readonly logger: Pick<AppLogger, 'error' | 'info'> = appLogger,
    private readonly options: WorkflowYjsRoomServiceOptions = {},
  ) {}

  async connect(input: {
    connection: WorkflowRoomConnection
    workflow: WorkflowSummary
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

  async handleMessage(input: {
    connection: WorkflowRoomConnection
    message: WorkflowYjsRoomMessage
    workflow: WorkflowSummary
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
          if (room.persistedUpdatesSinceSnapshot >= snapshotCompactionThreshold) {
            await this.#compactRoomWithoutLock(room, 'update_threshold')
          }
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

  async initializeWorkflow(
    workflow: WorkflowSummary,
    snapshot: Pick<WorkflowYjsSnapshot, 'edges' | 'nodes'>,
  ): Promise<WorkflowYjsSnapshot> {
    const existing = await this.repository.getSnapshot(workflow.id)
    if (existing) {
      throw new Error('Workflow Yjs snapshot already exists.')
    }
    const normalized = normalizeSnapshot(snapshot)
    validateCanvas(normalized.nodes, normalized.edges)
    const y = createWorkflowYDoc()
    importWorkflowSnapshotToYDoc(y, normalized, 'mina-server-initialize')
    const stateVector = Y.encodeStateVector(y.ydoc)
    await this.repository.saveSnapshot({
      snapshotBin: Y.encodeStateAsUpdate(y.ydoc),
      stateVector,
      version: workflow.version,
      workflowId: workflow.id,
    })
    return {
      ...normalized,
      version: workflow.version,
      workflowId: workflow.id,
      yjsStateVector: stateVector,
    }
  }

  async snapshotForWorkflow(workflow: WorkflowSummary): Promise<WorkflowYjsSnapshot> {
    const room = await this.#getRoom(workflow)
    this.#clearRoomCleanup(room)
    const snapshot = normalizeSnapshot(exportWorkflowSnapshotFromYDoc(room.y))
    if (room.connections.size === 0) {
      this.#scheduleRoomCleanup(room)
    }
    return {
      ...snapshot,
      version: room.snapshotVersion,
      workflowId: workflow.id,
      yjsStateVector: Y.encodeStateVector(room.y.ydoc),
    }
  }

  async getSnapshotVersion(workflowId: string): Promise<number | undefined> {
    const existing = this.#rooms.get(workflowId)
    if (existing) {
      return (await existing).snapshotVersion
    }
    return (await this.repository.getSnapshot(workflowId))?.version
  }

  async replaceSnapshotForWorkflow(
    workflow: WorkflowSummary,
    snapshot: Pick<WorkflowYjsSnapshot, 'edges' | 'nodes'>,
    reason: string,
  ): Promise<WorkflowYjsSnapshot> {
    const normalized = normalizeSnapshot(snapshot)
    validateCanvas(normalized.nodes, normalized.edges)
    const room = await this.#getRoom(workflow)
    this.#clearRoomCleanup(room)
    const result = await this.#withWorkflowLock(workflow.id, async () => {
      importWorkflowSnapshotToYDoc(room.y, normalized, 'mina-server-replace')
      const stateVector = Y.encodeStateVector(room.y.ydoc)
      const snapshotBin = Y.encodeStateAsUpdate(room.y.ydoc)
      const nextSnapshotVersion = Math.max(room.snapshotVersion + 1, workflow.version + 1)
      await this.repository.saveSnapshot({
        snapshotBin,
        stateVector,
        version: nextSnapshotVersion,
        workflowId: workflow.id,
      })
      await this.repository.deleteUpdates(workflow.id)
      await this.#notifySnapshotSaved(workflow.id, nextSnapshotVersion, reason)
      room.persistedUpdatesSinceSnapshot = 0
      room.snapshotVersion = nextSnapshotVersion
      this.logger.info(
        {
          edgeCount: normalized.edges.length,
          nodeCount: normalized.nodes.length,
          reason,
          snapshotBytes: snapshotBin.byteLength,
          stateVectorBytes: stateVector.byteLength,
          workflowId: workflow.id,
          workflowVersion: nextSnapshotVersion,
        },
        'Workflow Yjs snapshot replaced.',
      )
      return {
        ...normalized,
        version: nextSnapshotVersion,
        workflowId: workflow.id,
        yjsStateVector: stateVector,
      }
    })
    if (room.connections.size === 0) {
      this.#scheduleRoomCleanup(room)
    }
    return result
  }

  async compactWorkflow(
    workflow: WorkflowSummary,
    reason: string,
  ): Promise<WorkflowYjsSnapshot> {
    const startedAt = Date.now()
    const timings: Record<string, number> = {}
    let lockWaitMs = 0
    let nodeCount = 0
    let edgeCount = 0
    let snapshotBytes = 0
    let stateVectorBytes = 0
    const finishTiming = (name: string, phaseStartedAt: number): void => {
      timings[name] = Date.now() - phaseStartedAt
    }
    this.logger.info(
      {
        workflowId: workflow.id,
        workflowVersion: workflow.version,
        reason,
      },
      'Workflow Yjs compaction started.',
    )
    const roomStartedAt = Date.now()
    const room = await this.#getRoom(workflow)
    finishTiming('getRoomMs', roomStartedAt)
    this.#clearRoomCleanup(room)
    try {
      const result = await this.#withWorkflowLock(
        workflow.id,
        async () => {
          const exportStartedAt = Date.now()
          const snapshot = normalizeSnapshot(exportWorkflowSnapshotFromYDoc(room.y))
          nodeCount = snapshot.nodes.length
          edgeCount = snapshot.edges.length
          finishTiming('exportSnapshotMs', exportStartedAt)

          const validateStartedAt = Date.now()
          validateCanvas(snapshot.nodes, snapshot.edges)
          finishTiming('validateCanvasMs', validateStartedAt)

          const encodeStateVectorStartedAt = Date.now()
          const stateVector = Y.encodeStateVector(room.y.ydoc)
          stateVectorBytes = stateVector.byteLength
          finishTiming('encodeStateVectorMs', encodeStateVectorStartedAt)

          const encodeSnapshotStartedAt = Date.now()
          const snapshotBin = Y.encodeStateAsUpdate(room.y.ydoc)
          snapshotBytes = snapshotBin.byteLength
          finishTiming('encodeSnapshotMs', encodeSnapshotStartedAt)

          const nextSnapshotVersion = room.persistedUpdatesSinceSnapshot > 0
            ? Math.max(room.snapshotVersion + 1, workflow.version)
            : Math.max(room.snapshotVersion, workflow.version)
          const saveSnapshotStartedAt = Date.now()
          await this.repository.saveSnapshot({
            snapshotBin,
            stateVector,
            version: nextSnapshotVersion,
            workflowId: workflow.id,
          })
          finishTiming('saveYjsSnapshotMs', saveSnapshotStartedAt)
          await this.#notifySnapshotSaved(workflow.id, nextSnapshotVersion, reason)
          room.persistedUpdatesSinceSnapshot = 0
          room.snapshotVersion = nextSnapshotVersion

          const pruneStartedAt = Date.now()
          await this.repository.deleteUpdates(workflow.id)
          finishTiming('pruneUpdatesMs', pruneStartedAt)

          return {
            ...snapshot,
            version: nextSnapshotVersion,
            workflowId: workflow.id,
            yjsStateVector: stateVector,
          }
        },
        (waitMs) => {
          lockWaitMs = waitMs
        },
      )
      this.logger.info(
        {
          edgeCount,
          lockWaitMs,
          nodeCount,
          roomConnections: room.connections.size,
          snapshotBytes,
          stateVectorBytes,
          timings,
          totalMs: Date.now() - startedAt,
          workflowId: workflow.id,
          workflowVersion: result.version,
          reason,
        },
        'Workflow Yjs compaction completed.',
      )
      if (room.connections.size === 0) {
        this.#scheduleRoomCleanup(room)
      }
      return result
    } catch (error) {
      this.logger.error(
        {
          edgeCount,
          error,
          lockWaitMs,
          nodeCount,
          roomConnections: room.connections.size,
          snapshotBytes,
          stateVectorBytes,
          timings,
          totalMs: Date.now() - startedAt,
          workflowId: workflow.id,
          workflowVersion: workflow.version,
          reason,
        },
        'Workflow Yjs compaction failed.',
      )
      throw error
    }
  }

  async #getRoom(workflow: WorkflowSummary): Promise<WorkflowCollaborationRoom> {
    const existing = this.#rooms.get(workflow.id)
    if (existing) {
      return existing
    }
    const created = this.#createRoom(workflow)
    this.#rooms.set(workflow.id, created)
    return created
  }

  async #createRoom(workflow: WorkflowSummary): Promise<WorkflowCollaborationRoom> {
    const y = createWorkflowYDoc()
    const persistedSnapshot = await this.repository.getSnapshot(workflow.id)
    if (!persistedSnapshot) {
      throw new Error('Workflow Yjs snapshot not found.')
    }
    Y.applyUpdate(y.ydoc, persistedSnapshot.snapshotBin, 'mina-server-load')
    const updates = await this.repository.listUpdates(workflow.id)
    for (const update of updates) {
      Y.applyUpdate(y.ydoc, update.updateBin, 'mina-server-load')
    }

    const room: WorkflowCollaborationRoom = {
      awareness: new awarenessProtocol.Awareness(y.ydoc),
      cleanupTimer: undefined,
      connections: new Set(),
      persistedUpdatesSinceSnapshot: updates.length,
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
      void this.#rooms.get(room.workflowId)?.then(async (currentRoom) => {
        if (currentRoom !== room || room.connections.size > 0) {
          return
        }
        await this.#compactRoom(room, 'idle_cleanup')
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
  }

  async #compactRoom(room: WorkflowCollaborationRoom, reason: string): Promise<void> {
    await this.#withWorkflowLock(room.workflowId, async () => {
      await this.#compactRoomWithoutLock(room, reason)
    })
  }

  async #compactRoomWithoutLock(room: WorkflowCollaborationRoom, reason: string): Promise<void> {
    if (room.persistedUpdatesSinceSnapshot === 0 && reason !== 'idle_cleanup') {
      return
    }
    const snapshotBin = Y.encodeStateAsUpdate(room.y.ydoc)
    const stateVector = Y.encodeStateVector(room.y.ydoc)
    const nextSnapshotVersion = room.persistedUpdatesSinceSnapshot > 0
      ? room.snapshotVersion + 1
      : room.snapshotVersion
    await this.repository.saveSnapshot({
      snapshotBin,
      stateVector,
      version: nextSnapshotVersion,
      workflowId: room.workflowId,
    })
    await this.repository.deleteUpdates(room.workflowId)
    await this.#notifySnapshotSaved(room.workflowId, nextSnapshotVersion, reason)
    room.persistedUpdatesSinceSnapshot = 0
    room.snapshotVersion = nextSnapshotVersion
    this.logger.info(
      {
        reason,
        snapshotBytes: snapshotBin.byteLength,
        stateVectorBytes: stateVector.byteLength,
        workflowId: room.workflowId,
        workflowVersion: room.snapshotVersion,
      },
      'Workflow Yjs room compacted.',
    )
  }

  async #withWorkflowLock<T>(
    workflowId: string,
    task: () => Promise<T>,
    onAcquired?: (waitMs: number) => void,
  ): Promise<T> {
    const waitStartedAt = Date.now()
    const previous = this.#workflowLocks.get(workflowId) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    const chained = previous.then(() => current)
    this.#workflowLocks.set(workflowId, chained)
    await previous
    onAcquired?.(Date.now() - waitStartedAt)
    try {
      return await task()
    } finally {
      release()
      if (this.#workflowLocks.get(workflowId) === chained) {
        this.#workflowLocks.delete(workflowId)
      }
    }
  }

  async #notifySnapshotSaved(workflowId: string, version: number, reason: string): Promise<void> {
    await this.options.onSnapshotSaved?.({
      reason,
      timestamp: new Date().toISOString(),
      version,
      workflowId,
    })
  }
}
