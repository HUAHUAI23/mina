# 03 — Backend Architecture

Follows the established API layering (`route -> service -> repository
-> data source`) and the tasks-module precedent of small internal files
grouped by responsibility under one feature module.

## 1. Module map

Two new modules plus surgical changes to `chat`:

```text
apps/api/src/modules/story-assets/
  story-assets.routes.ts          # CRUD + image/voice binding endpoints
  story-assets.service.ts         # ref-key generation, binding rules, manifest source data
  story-assets.repository.ts      # port
  story-assets.drizzle-repository.ts
  story-asset-mappers.ts          # row -> DTO

apps/api/src/modules/agent/
  agent.routes.ts                 # chain catalog, prompt modules CRUD + preview,
                                  # generation profile GET/PUT, plan GET
  agent-chains.service.ts         # chain registry lookup, run dispatch entrypoint
  agent-responder.ts              # implements chat's AssistantChatResponder dispatch:
                                  # chainKey on the run -> chain execution; falls back
                                  # to plain conversation when chainKey is null
  generation-profile.service.ts   # resolve project -> account -> code default; validate writes
  prompt-modules.service.ts       # fork-on-write defaults, assembled preview
  agent-plans.service.ts          # plan persistence, plan DTO reads
  repositories/                   # ports + drizzle impls for prompt modules, plans, profiles
  chains/
    chain-definition.ts           # ChainDefinition type, ChainContext, ChainResult
    chain-registry.ts             # key -> definition map (code-owned catalog)
    conversation/general-conversation.chain.ts
    writing/novel.chain.ts
    writing/screenplay.chain.ts
    writing/storyboard.chain.ts
    assets/asset-curation.chain.ts
    production/single-shot.chain.ts
    production/storyboard-to-video.chain.ts
  context/
    asset-manifest.ts             # story assets -> manifest text + ref index
    relevance.ts                  # input-text filtering for manifest size
    neighbor-window.ts            # prev/next shot context windows
  prompts/
    system-protocols.ts           # per-chain built-in layer 1 (versioned constants)
    output-protocols.ts           # per-chain built-in layer 3 + variants
    default-modules.ts            # seed pluggable modules per chain (data layer)
    assemble-prompt.ts            # [protocol] + [enabled modules] + [output protocol]
  compiler/
    reference-grammar.ts          # re-export of contracts regex + extraction helpers
    envelope-parser.ts            # storyboard + shot production envelope parsing
    reference-resolver.ts         # @ref -> story asset / upload resolution
    slot-packer.ts                # appearance-order packing + capability caps
    capability.ts                 # reads limits/duration sets from task ModelRegistry
    token-renderer.ts             # locale token rendering + mention map
    plan-graph-builder.ts         # PlanGraph assembly, flow_group decisions, placeholders
    compile-report.ts             # adjustment codes, lint issue model
    compile-shot.ts               # orchestrates phases 1–7 for one item (pure)
```

Composition: `createAppDependencies()` wires the new services; the
chain registry, system protocols, and default modules are code-level
data (no DB reads to enumerate chains).

## 2. Layering and dependency rules

- `compiler/*` and `context/*` are **pure** (no I/O, no repositories).
  They receive resolved inputs and return values. This is where the
  bulk of unit tests live.
- `chains/*` orchestrate: load context via services, call the model
  via the existing AI SDK factory, parse, compile, persist. They do
  not touch Drizzle directly.
- `modules/agent` may depend on `modules/story-assets` and the tasks
  module's `ModelRegistry` **read surface** only. Neither tasks nor
  workflows may import from `agent` (checked by
  `bun run check:boundaries`).
- `modules/chat` gains no knowledge of chains beyond the existing
  `AssistantChatResponder` port: `agent-responder.ts` is injected where
  `AiChatService` is today, and dispatches by the run's `chainKey`.
  The plain `AiChatService` remains the `conversation.general`
  implementation detail.
- Provider/model capability facts live only in task model specs.
  `compiler/capability.ts` adapts them; it never hardcodes limits.

## 3. Chain execution lifecycle

Reuses the durable chat run machinery end to end:

```text
POST /api/chat/threads/:id/messages { parts, chainKey? }
  -> chat.service: insert user message + streaming placeholder
     + chat_assistant_runs row (chainKey persisted)        [1 tx]
  -> drain thread (request path now; scheduler recovery later)
  -> agent-responder resolves ChainDefinition by run.chainKey
  -> chain.execute(ChainContext)
       ChainContext = { accountId, projectId?, workflowId?, locale,
                        history, attachments, manifest?, profile?,
                        publishPhase(), streamDelta() }
  -> ChainResult persisted as assistant message parts
       text chains   -> [document part?, text part]
       asset chain   -> [asset_changes part, text part]
       production    -> [plan part, text part(markdown summary)]
  -> chat.message.updated event closes the turn
```

Phase events: chains publish progress through the existing chat event
bus as a new event type `chat.run.phase`
`{ runId, phase, status: 'start' | 'complete' | 'failed', data?, ts }`.
Phase keys are namespaced:
`context.prepare`, `storyboard.parse`, `item.<n>.generate`,
`item.<n>.compile`, `plan.persist`. Events are ephemeral; clients that
reconnect re-render from the final message. Text-delta streaming for
writing/conversation chains keeps using the existing sequenced
`chat.message.delta` snapshots.

Failure semantics follow the chat classifier: transient model/provider
failures retry the run (already built); a chain-level deterministic
failure (unparseable after repair, no executable items) finishes the
run with a structured error part + plan row in `failed` status —
visible state, not a stuck run.

### Production chain internals (`storyboard-to-video`)

```text
parse storyboard envelopes (no LLM)            phase storyboard.parse
create agent_plans row (status pending write)
for each item with bounded concurrency (p-limit ~3):
    build per-item context: manifest (filtered), neighbor window
      (prev/next source text + previous item's generated prompt summary)
    1 LLM call -> envelope + prose              phase item.N.generate
    parse; on envelope error -> 1 repair call; else item failed
    compile (pure)                              phase item.N.compile
collect items -> PlanGraph; plan status:
    all planned -> 'planned'; any blocked -> 'blocked';
    any failed but some executable -> 'partial';
    none executable -> 'failed'
persist plan + items; emit plan part            phase plan.persist
```

`single_shot` is the same pipeline with exactly one item, attachments
mapped to `upload_<n>` refs, and the `plan:` envelope key honored
(`i2i+video` produces image→video inside a `flow_group`).

## 4. Prompt assembly

```text
assemblePrompt(chainKey, accountId, locale):
  [1] system protocol        (code, includes reference grammar contract,
                              asset manifest section, output-language rule)
  [2] enabled prompt modules (DB rows; defaults when account has none)
  [3] output protocol        (code; grammar the envelope parser accepts)
```

The same assembler serves execution and the settings UI's read-only
"assembled preview" endpoint (`GET /api/agent/chains/:chainKey/prompt-preview`),
so users always see exactly what runs.

Prompt content language: protocols are written in English (repository
language) with an explicit output-language instruction bound to the
request locale; pluggable modules are user content in any language.

## 5. Route surface (all under authenticated `/api`)

```text
# story assets
GET    /api/projects/:projectId/story-assets
POST   /api/projects/:projectId/story-assets
GET    /api/story-assets/:id
PATCH  /api/story-assets/:id
DELETE /api/story-assets/:id
POST   /api/story-assets/:id/images          { mediaObjectId, role?, isPrimary? }
PATCH  /api/story-assets/:id/images/:imageId
DELETE /api/story-assets/:id/images/:imageId
POST   /api/story-assets/:id/voices          { mediaObjectId, isPrimary?, note? }
DELETE /api/story-assets/:id/voices/:voiceId

# agent
GET    /api/agent/chains                       # catalog for composer chips
GET    /api/agent/chains/:chainKey/prompt-modules
PUT    /api/agent/chains/:chainKey/prompt-modules   # full ordered set replace
GET    /api/agent/chains/:chainKey/prompt-preview
GET    /api/agent/plans/:planId                # plan + items + PlanGraph
GET    /api/agent/generation-profile?projectId=
PUT    /api/agent/generation-profile           # account or project scope
```

Validation through `apiValidator` + contracts schemas; errors use
stable codes + `messageKey` per API rules 11–14. New error codes
(examples): `STORY_ASSET_REF_CONFLICT`, `STORY_ASSET_MEDIA_INVALID`,
`AGENT_CHAIN_UNKNOWN`, `AGENT_PLAN_NOT_FOUND`,
`GENERATION_PROFILE_MODEL_UNKNOWN`.

## 6. Contracts layout

```text
packages/contracts/src/modules/story-assets/story-asset.schemas.ts
packages/contracts/src/modules/agent/chain.schemas.ts        # ChainKey, ChainCatalogEntry
packages/contracts/src/modules/agent/reference.schemas.ts    # ref grammar regex + token types
packages/contracts/src/modules/agent/plan-graph.schemas.ts   # PlanGraph/PlanItem/PlanNode/CompileReport
packages/contracts/src/modules/agent/prompt-module.schemas.ts
packages/contracts/src/modules/agent/generation-profile.schemas.ts
packages/contracts/src/modules/chat/chat.schemas.ts          # extended part union, chainKey on create
```

Subpath exports per the boundary rules; web imports only these and the
typed client.

## 7. Testing strategy

- `compiler/*`: pure-function unit tests with fixtures, including the
  worked example from 01 in both locales, cap truncation, fallback
  chains, blocked placeholders, unknown-ref removal, duration clamps.
- `chains/*`: tests with a scripted fake `LanguageModel` (deterministic
  outputs per call) through the real responder path, asserting parts,
  plan rows, and phase event order. Doubles live under
  `apps/api/src/test/doubles/agent/`.
- Route-level Bun tests for every new endpoint (standards rule:
  request-level test per module), using builders under
  `test/builders` for story assets and profiles.
- Boundary check extended so `temp/**` is import-forbidden and
  `modules/agent` direction rules hold.
