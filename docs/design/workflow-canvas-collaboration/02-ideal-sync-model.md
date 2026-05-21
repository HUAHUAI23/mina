# 02 — Ideal Sync Model for N Clients

Illustrated below with three clients (A / B / C) but the design extends
to any number. The model is built on three invariants. Every concrete
rule that follows exists to preserve one of them.

| Invariant | Meaning |
|-----------|---------|
| **Single source of truth** | At any instant there is exactly one canonical representation of the document; everything UI-facing is a projection of it, never a parallel copy. |
| **Unidirectional causality** | Each local edit produces exactly one outbound message; the server does **not** echo it back to its origin. |
| **Idempotent operators** | Replaying the same op `N` times produces the same final state, so retransmits / reconnects can never amplify or corrupt state. |

Break any of them and the bugs from `01-problem-analysis.md` come back.

---

## 1. Topology — Yjs ydoc as the canonical state

```
                    ┌──────────────────────────┐
                    │   Server ydoc (canon)    │
                    │   + incremental update log │
                    │   + periodic binary snapshot │
                    └────────┬─────────────────┘
                             │  y-websocket (state vector diff)
          ┌──────────────────┼──────────────────┐
          │                  │                  │
     ┌────▼────┐        ┌────▼────┐        ┌────▼────┐
     │ A ydoc  │        │ B ydoc  │        │ C ydoc  │
     │   ↓     │        │   ↓     │        │   ↓     │
     │ React   │        │ React   │        │ React   │
     │ (read)  │        │ (read)  │        │ (read)  │
     └─────────┘        └─────────┘        └─────────┘
```

Key properties:

- There is **no separate transaction queue** on the client. The Yjs
  ydoc *is* the op log.
- There is **no REST "save full state" channel**. "Save" becomes a
  durability concern handled by the server, not a state-replication
  concern.
- There is **no client-side path that exports the ydoc, transforms it,
  and writes it back to the same ydoc**. That kind of read-modify-write
  loop is what generates broadcast amplification.
- Zustand (or whatever read model the UI uses) is a strictly **one-way
  projection** of the ydoc. It never mutates ydoc; it only subscribes.

---

## 2. Single edit lifecycle (A moves a node → B, C see it)

```
A finishes dragging a node (commit)
   │
   │  ① A side: y.nodeFrames.set('n1', {pos: (100,100)})
   │
   ▼
A.ydoc emits update U_A   ─────────────────┐
   │                                       │
   │  y-websocket: forward U_A to server   │
   ▼                                       │
Server.ydoc.applyUpdate(U_A)               │
   │                                       │
   │  ② server broadcasts U_A to B, C      │  KEY: NOT back to A
   │     (sender connection excluded)      │
   │                                       │
   ├──► B.ydoc.applyUpdate(U_A) ──► B re-renders
   └──► C.ydoc.applyUpdate(U_A) ──► C re-renders
   
   ③ server appends U_A to the update log;
     compacts to a binary snapshot when a threshold is hit
```

Each op crosses the wire exactly once. There is no round-trip. A's
local ydoc reached its final state in step ①; it does **not** wait for
a server acknowledgement before letting the UI render.

Why this cannot loop:

- The Yjs sync protocol uses **state vectors**: each peer only sends
  the other peer the ops it does not yet have.
- Yjs ops carry `(clientId, clock)` identity: re-applying the same op
  is a no-op. Retransmits are inherently safe.
- The server **excludes the sender connection** from broadcasts, so
  a peer never receives back the op it just emitted.

The combined effect of these three protocol-level properties is that
no application-level loop-prevention bookkeeping is needed.

---

## 3. Six hard rules for avoiding broadcast loops

These rules generalize the protocol guarantees in §2 to application
behaviour.

### Rule 1 — The server never modifies an op it received

The legacy `/collab/checkpoint` endpoint did:

```
client → server: encodeStateAsUpdate(entire ydoc)
server         : applyUpdate + export plain snapshot + write DB + return snapshot
client         : importWorkflowSnapshotToYjs(clear + re-set)   ← echo!
```

The correct model is **pure passthrough**: the server applies the op,
persists it, and broadcasts it. It does not transform it and it does
not send the result back to the sender.

### Rule 2 — A client never reads its own ydoc and writes back to it

This pattern is the most common source of multi-client divergence:

```ts
const snapshot = exportFromYjs(y)   // read
importIntoYjs(y, snapshot)          // write
```

Any read-derive-write cycle creates a new op with new clocks that
broadcasts to every peer. If multiple peers do it concurrently the ops
collide and over time accumulate spurious tombstones / overwrites.

### Rule 3 — A single edit has a single commit point

- UI event ⟶ **direct** `y.nodes.set(...)` / `y.nodeOrder.insert(...)`.
- **Not**: UI event ⟶ Zustand action ⟶ push transaction ⟶ microtask
  ⟶ write to Yjs.

Every extra layer is another spot the two views can desync.

### Rule 4 — Rendering subscribes, never caches in parallel

React reads via `useY(...)`, `useSyncExternalStore + ydoc.observe(...)`,
or — if you keep a Zustand mirror for selector ergonomics — a **single
sink** that copies from ydoc to store:

```ts
ydoc.observeDeep(() => {
  store.setState({ nodes: exportFromYdoc(ydoc.nodes), ... }) // only writer
})
// Delete every store.setX action. UI calls ydoc ops directly.
```

The mirror is acceptable; the *second writer* into it is not.

### Rule 5 — Use Yjs's state vector, not application-level revisions

The legacy code had three counters (`draftRevision`,
`liveDocument.updateRevision`, `workflow.version`) that all had to
stay aligned for correctness. They did not, and the bugs followed.

The ideal model keeps only two, and they need not be aligned:

- `Y.encodeStateVector(ydoc)` — used by the Yjs sync protocol;
  automatically respects causality.
- `workflow.version` — an etag on the persisted snapshot, used by REST
  callers that don't speak the Yjs protocol. Independent of collab.

### Rule 6 — "Save" stops being an RPC, becomes a metric

- The server appends every received update to a durable log; a
  background compactor turns the log into snapshots periodically.
- The UI's "saved" indicator becomes a derived state:

  ```ts
  saved = compareStateVectors(local.sv, lastAckedFromServer) === 0
  ```

- A user pressing ⌘S can still exist as a UX affordance — it triggers
  an immediate snapshot compaction on the server. It does **not** carry
  state.

---

## 4. Edge cases

### 4.1 A is offline, edits locally, then reconnects while B has also edited

- A's Yjs ops accumulate in memory (or `y-indexeddb` for persistence).
- On reconnect, the y-websocket sync handshake exchanges state vectors:
  A pushes the ops the server doesn't have; the server pushes the ops
  A doesn't have (which include B's).
- CRDT merge is automatic. No "who-wins" code path is needed in the
  application.

### 4.2 A and B simultaneously edit the same field of the same node

- Text-like fields (prompt, name): use `Y.Text` for per-character merge.
  Two cursors editing different parts of a prompt converge cleanly.
- Numeric fields (position, width): `Y.Map.set` last-writer-wins.
  Visually obvious when a conflict happens, and conflict frequency on
  positions is naturally low because nobody actively co-drags the same
  node.
- List fields (`mediaSlots`): use `Y.Array`. Concurrent inserts both
  survive.

### 4.3 The server's room is idle-cleaned, then a client reconnects

- The server loads the latest binary snapshot from the DB and replays
  any later updates to reconstruct the room ydoc.
- The reconnecting client runs `syncStep1/2` against the rebuilt room
  ydoc. Ops the client has and the server doesn't go up; ops the server
  has and the client doesn't come down.
- **Critical: the client must not push a transiently-empty state to the
  server.** If the client had been bug-cleared, that emptiness becomes
  the new canonical state. Eliminating the application-level `clear()`
  paths (Rule 2) is what makes this safe.

### 4.4 A buggy client emits a malformed op

- The server validates each incoming update against the canvas schema
  before broadcasting. The validation is itself a CRDT-safe operation
  (apply the update to a temporary clone, export, run Zod).
- On validation failure, the server **rejects** the update (closing the
  connection or returning a reject message). It does **not** issue a
  correction op of its own, because that would be a server-originated
  echo and would violate Rule 1.
- The client is responsible for re-syncing and emitting a new, valid op.

---

## 5. Mapping legacy concepts to the ideal model

| Legacy concept | Ideal model |
|----------------|-------------|
| `documentTransactions` + `appliedTransactionRevisions` | Delete. Yjs is the op log. |
| `commitDocumentTransaction` + `queueMicrotask` | Delete. UI events call `ydoc.transact(...)` directly. |
| `/collab/checkpoint` REST + full `encodeStateAsUpdate` body | Delete. Keep only the `/collab/:room` WebSocket. |
| `importWorkflowSnapshotToYjs` (clear + re-set) | Delete. The only "import" is the server's cold-load from DB binary updates. |
| `reconcileLiveWorkflowYjsSnapshot` | Delete. |
| Zustand `setNodeFrame` / `addNode` / `removeGraphNodes` mutation actions | Become thin wrappers that call ydoc ops. |
| `applyRemoteSnapshot` replacing the whole nodes/edges array | Delete. Store is filled by `ydoc.observe` one-way. |
| `draftRevision` / `savedRevision` / `remoteVersion` counters | Delete. Derive "saved" from state vectors. |
| `workflow.definition.updated` WS event | Delete. The Yjs sync channel covers this. |

---

## 6. Why this matters in one sentence

> **CRDT collaboration is not primarily about how to merge edits; it is
> about making each piece of information travel the network exactly
> once.** The legacy bugs all stemmed from the same edit being
> translated multiple times and broadcast back to its origin. Make
> Yjs the single source of truth and remove the REST full-state
> checkpoint + reimport path, and the three-client model naturally
> degenerates into "each op appears on the wire once and is applied
> once per peer."
