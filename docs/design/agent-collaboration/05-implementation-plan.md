# 05 — Implementation Plan

Ordered milestones. Each milestone states **scope**, **work items**,
and a **definition of done** (DoD). Do not start a milestone before the
previous one's DoD holds, except where a milestone is marked
parallel-safe. Every milestone ends with the listed verification
commands passing and no regressions in `bun run check`.

Global rules for the implementing agent:

- Read `README.md`, `01`–`04` in this directory first; fixed decisions
  there are not up for redesign.
- `temp/lumina` is reference reading only. Never import from `temp/**`.
- Follow `docs/development-standards.md` for every change (layering,
  contracts-first validation, i18n key rules, test placement,
  Tailwind-first UI).
- Each milestone should land as one coherent change set with tests.
  Update `docs/architecture.md` / onboarding guide only in M12.
- When a contracts schema and this document disagree with existing
  code conventions, match existing conventions and note the deviation
  in the M12 doc update.

---

## M1 — Contracts foundation

**Scope**: all shared schemas, no runtime behavior.

Work items:

1. `packages/contracts/src/modules/agent/chain.schemas.ts`:
   `ChainKeySchema` (enum of the 7 v1 keys), `ChainFamilySchema`,
   `ChainCatalogEntrySchema` (key, family, resultKind, title/description
   message keys).
2. `packages/contracts/src/modules/agent/reference.schemas.ts`:
   the reference regex (single exported constant), `ReferenceKind`
   union, `extractReferences(text)` helper, token-shape unit contract.
3. `packages/contracts/src/modules/agent/plan-graph.schemas.ts`:
   `PlanGraph`, `PlanItem`, `PlanNode`, `PlanMediaSlotItem`,
   `PlanEdge`, `CompileReport`, `CompileAdjustment` (code + primitive
   params), statuses per 01/02.
4. `packages/contracts/src/modules/agent/generation-profile.schemas.ts`:
   `ImageGenerationDefaults`, `VideoGenerationDefaults`,
   `GenerationProfileSchema`, `getDefaultGenerationProfile()`.
5. `packages/contracts/src/modules/agent/prompt-module.schemas.ts`:
   module DTO + ordered-set replace request schema.
6. `packages/contracts/src/modules/story-assets/story-asset.schemas.ts`:
   asset/image/voice DTOs, create/update requests, ref-key format
   validators (`char_|scene_|prop_`, `img_`, `voice_`).
7. Extend `packages/contracts/src/modules/chat/chat.schemas.ts`:
   `chainKey` optional on message create; part union gains `plan`,
   `document`, `asset_changes` per 02 §7.
8. Add subpath exports for the new modules in the contracts package.

DoD:

- Schema unit tests cover: ref regex accepts/rejects fixtures, plan
  graph round-trip parse, profile defaults validity, chat part union
  backward compatibility (old parts still parse).
- `bun --filter @mina/contracts typecheck` and `bun run typecheck` pass.
- No app code changed yet.

---

## M2 — Database schema & repositories

**Scope**: tables from 02, repository ports + Drizzle impls + doubles.

Work items:

1. Add to `apps/api/src/db/schema.ts`: `story_assets`,
   `story_asset_images`, `story_asset_voices`, `generation_profiles`,
   `agent_prompt_modules`, `agent_plans`, `agent_plan_items`; add
   `chain_key` to `chat_assistant_runs`. Generate migrations the same
   way existing schema changes do.
2. Add `story_asset` to the media purpose union in contracts and the
   media upload validation path.
3. Repository ports + Drizzle implementations:
   `story-assets.repository.ts` (+drizzle), and under
   `modules/agent/repositories/`: prompt modules, generation profiles,
   plans (+items).
4. Test doubles under `apps/api/src/test/doubles/story-assets/` and
   `.../agent/`; builders under `test/builders` (storyAsset,
   generationProfile, agentPlan).
5. Extend the chat repository for `chainKey` write/read on runs.

DoD:

- Migrations apply cleanly to a fresh database (`db:push`/migrate path
  used by the repo).
- Repository tests: ref-key uniqueness (partial index), primary-image
  uniqueness, profile scope resolution (project overrides account),
  plan + items cascade read.
- `bun --filter @mina/api test` passes.

---

## M3 — Story assets module (API)

**Scope**: full story-assets REST surface + service rules.

Work items:

1. `modules/story-assets/` per 03 §1: routes, service, mappers.
2. Service rules: refKey generation (`slugify(name)` + type prefix +
   collision suffix; immutable), voice binding only on characters,
   media object must be account-owned + `ready` + image/audio kind
   matching binding type, primary toggles atomic.
3. Wire into `createAppDependencies()` and the API router; register
   error codes + `messageKey`s in `@mina/i18n` catalogs.
4. Route-level Bun tests for every endpoint incl. cross-account
   rejection and invalid-media rejection.

DoD:

- All story-asset endpoints function with validation errors as
  structured `VALIDATION_FAILED` / semantic codes.
- A seeded test can: create character → bind two images → set primary
  → bind voice → list by project and receive manifest-source DTOs.
- `bun --filter @mina/api test`, `bun run i18n:compile` pass.

---

## M4 — Generation profile (API) — parallel-safe with M3

**Scope**: profile read/write + resolution.

Work items:

1. `generation-profile.service.ts`: resolve(projectId?) with
   project → account → `getDefaultGenerationProfile()` fallback;
   PUT validates `providerName`/`model` against `ModelRegistry`
   (model exists; duration default inside the model's allowed set;
   resolution/aspect valid per model spec params).
2. Routes `GET/PUT /api/agent/generation-profile` (scope by optional
   `projectId`).
3. Tests: fallback order, registry-invalid writes rejected with
   `GENERATION_PROFILE_MODEL_UNKNOWN`.

DoD: endpoints pass route tests; profile resolution helper is exported
for chain/compiler use.

---

## M5 — Agent module skeleton: registry, prompts, routes

**Scope**: chain catalog + prompt assembly + prompt module CRUD. No
chain execution yet.

Work items:

1. `chains/chain-definition.ts` + `chain-registry.ts` with the 7 v1
   definitions (execution stubs throwing `AGENT_CHAIN_NOT_IMPLEMENTED`
   for now).
2. `prompts/system-protocols.ts`, `output-protocols.ts`,
   `default-modules.ts`, `assemble-prompt.ts` per 03 §4. System
   protocol must embed the reference grammar and manifest section
   format from 01.
3. `prompt-modules.service.ts` with fork-on-write defaults and the
   ordered-set replace semantics.
4. Routes: `GET /api/agent/chains`,
   `GET/PUT /api/agent/chains/:chainKey/prompt-modules`,
   `GET /api/agent/chains/:chainKey/prompt-preview`.
5. Tests: defaults visible before first write; fork-on-write copies
   defaults; preview equals exact assembly used by the executor
   (single assembler function asserted by reference).

DoD: catalog/preview/modules endpoints pass route tests; registry is
the single chain enumeration point.

---

## M6 — Chain runtime over durable chat runs + text chains

**Scope**: chainKey flows through chat; conversation + writing chains
execute with streaming.

Work items:

1. Chat message create accepts `chainKey`, persists it on the
   `chat_assistant_runs` row; reject unknown keys
   (`AGENT_CHAIN_UNKNOWN`).
2. `agent-responder.ts` replaces the direct `AiChatService` wiring in
   dependencies: null chainKey → existing conversation behavior
   (unchanged); known chainKey → chain execution with `ChainContext`
   (history, attachments, locale, publishPhase, streamDelta).
3. Implement `conversation.general` (delegating to current behavior),
   `writing.novel`, `writing.screenplay`, `writing.storyboard`.
   Storyboard chain emits a `document` part
   (`protocol: 'storyboard'`) plus a short text part; its output must
   parse with the (not yet built) envelope grammar — write the
   protocol fixture now and assert format by regex.
4. Add `chat.run.phase` event type to chat contracts + event bus.
5. Tests with a scripted fake LanguageModel through the real drain
   path: chainKey persistence, retry re-enters the same chain, parts
   shape per chain, delta streaming still sequenced.

DoD:

- Sending a message with `writing.storyboard` returns an assistant
  message containing a protocol-formatted document part.
- Conversation behavior is byte-compatible for messages without
  chainKey (existing chat tests untouched and green).

---

## M7 — Compiler core (pure)

**Scope**: everything under `modules/agent/compiler/` per 03 §1 and the
phase semantics of 01 §5. No chain wiring yet. Highest-test-density
milestone.

Work items:

1. `envelope-parser.ts`: storyboard protocol (`#shot`, `duration:`)
   and shot production protocol (`duration/aspect/plan` + `---`).
   Tolerant of surrounding whitespace/markdown fences; strict on
   header keys; returns structured parse errors for the repair loop.
2. `reference-resolver.ts`, `slot-packer.ts`, `capability.ts`,
   `token-renderer.ts`, `plan-graph-builder.ts`, `compile-report.ts`,
   `compile-shot.ts` implementing phases 1–7 exactly as 01 §5,
   including implicit asset injection, generative character fallback
   (profile flag), caps from `ModelRegistry`, mode fallback chain,
   duration clamp, placeholder slots for blocked refs, mention map.
3. Locale rendering table for zh-Hans/en tokens (`图{n}`/`image{n}`,
   `音频{n}`/`audio{n}`, `声音参考{t}`/`voice ref {t}`,
   first-mention `{name}({t})` formatting).
4. Fixtures: the full worked example from 01 §7 in both locales;
   cap-overflow (10 images); unknown ref; speaker without voice;
   character without image (blocked) and with generative fallback
   (image→video graph); `i2i+video` single-shot graph; malformed
   envelope errors.

DoD: compiler test suite green and reviewed against 01 §5 phase by
phase; zero I/O imports inside `compiler/` (boundary check or lint
assertion).

---

## M8 — Production chains + plan persistence + plan part

**Scope**: `production.storyboard_to_video` and
`production.single_shot` end to end on the backend.

Work items:

1. `context/asset-manifest.ts` + `relevance.ts` +
   `neighbor-window.ts` per 01 §2 and 03 §3.
2. `agent-plans.service.ts`: create plan, persist items
   (sourceText/generatedText/compileReport/status), plan DTO read;
   `GET /api/agent/plans/:planId` route.
3. `storyboard-to-video.chain.ts`: parse → fan-out with p-limit(3) →
   per-item generate (1 call) → repair round on envelope error →
   compile → aggregate statuses (`planned/partial/blocked/failed`) →
   persist → emit `plan` part + markdown summary text part; phase
   events throughout.
4. `single-shot.chain.ts`: attachments → `upload_<n>` media objects
   (chat attachments are already media objects), one item, honors
   `plan:` key.
5. Failure paths: total parse failure after repair → plan `failed`
   with structured error fields; provider transient errors keep the
   normal run retry path (idempotency: re-running a failed run creates
   a fresh plan; the superseded plan row keeps history).
6. Tests: scripted-model end-to-end producing a 3-shot plan (one
   blocked, one with cap truncation); plan row + items + part
   assertions; phase event order; single-shot with two uploads
   producing an i2v node; repair-loop test (first output malformed,
   second valid).

DoD: with a scripted model, POSTing a storyboard message with
`production.storyboard_to_video` yields a persisted plan readable via
`GET /api/agent/plans/:planId` whose PlanGraph validates against
contracts, and an assistant message with a correct `plan` part.

---

## M9 — Web: chain picker, run progress, plan card, Yjs insertion

**Scope**: the canvas chat consumes everything built in M5–M8.

Work items:

1. `chain-picker.tsx` in the composer (catalog from
   `GET /api/agent/chains`; production chains visually grouped;
   selection sent as `chainKey`).
2. `run-phase-progress.tsx` consuming `chat.run.phase`;
   `document-part.tsx` with the `Produce videos` pre-fill action;
   `asset-changes-part.tsx` placeholder rendering (chain lands M11).
3. `plan-card.tsx` + `plan-item-row.tsx` per 04 §3 (fetch plan by id;
   render statuses, adjustments via i18n keys, blocked names; final
   prompt viewer with mention highlighting).
4. `plan/insert-plan.ts` + `plan-layout.ts` per 04 §2: PlanGraph →
   canvas nodes/edges/mediaSlots inside **one** `'mina-local'` Yjs
   transaction; profile merge at insert time; insert report; partial
   (per-item) insertion.
5. i18n catalogs for all new keys (both locales) + compile step.
6. Tests: store-level insertion tests (plan fixture → ydoc/store
   assertions: node count, group parenting, slot sources mapped to
   `run_output` inside flow groups, placeholder slot flagged, single
   undo step reverts all); part rendering smoke tests if a component
   test harness exists, otherwise domain-level view-model tests.

DoD: in a dev session against the scripted model (or recorded plan
fixture), a storyboard message produces a plan card and `Insert all`
materializes grouped, configured, slot-filled nodes on the canvas;
undo removes them in one step; collaboration peers receive one update.

---

## M10 — Web: story asset board + generation profile settings

**Scope**: management surfaces. Parallel-safe with M9 after M3/M4.

Work items:

1. `features/story-assets/` per 04 §5 + route
   `/projects/$projectId/story-assets` + canvas side-panel entry.
2. Upload with purpose `story_asset`; pick-from-asset-library flow
   reusing `mediaObjectId`; audio preview for voices.
3. `features/agent-settings/` route `/settings/agent`:
   `generation-profile-form.tsx` (model options sourced from the
   pricing/model catalog endpoint or a new
   `GET /api/agent/generation-profile/options` derived from
   `ModelRegistry`), `prompt-module-editor.tsx` +
   `prompt-preview-panel.tsx` per 04 §1.
4. `useGenerationProfile(projectId)` consumed by manual canvas node
   creation defaults (replacing any hardcoded task draft defaults).
5. i18n for all copy; route-level loading/error states per app shell
   patterns.

DoD: a user can curate a character with images + voice entirely from
the UI; changing the video default model immediately affects both a
newly hand-created video node and the next AI plan compile; prompt
module edits show up verbatim in the preview endpoint output.

---

## M11 — Asset curation chain

**Scope**: `assets.curation` end to end.

Work items:

1. Curation output protocol (01 §4.3) + operation executor in the
   story-assets service (transactional apply, per-op
   validation, rejected ops with reasons).
2. `asset-curation.chain.ts`: attachments → upload refs, manifest
   injection (so the model updates instead of duplicating), JSON-mode
   call, execute ops, emit `asset_changes` part + text summary.
3. Web: `asset-changes-part.tsx` real rendering with links to the
   board.
4. Tests: create+bind from two uploads; duplicate-name handling
   (model told existing refKey → update path); rejected op surfaces.

DoD: "这是李华的形象照和音色" with two attachments creates the
character with image + voice bindings visible on the board, and the
chat shows the applied operation summary.

---

## M12 — Hardening, docs, baseline

Work items:

1. Boundary check: forbid `temp/**` imports; assert agent module
   dependency direction.
2. Sweep error codes/messages: every new user-facing error has
   `messageKey` in both catalogs; stale keys removed.
3. Concurrency pass: plan fan-out under run retry (no duplicate plan
   rows for one run — guard by `runId` idempotency on plan create);
   scheduler recovery of a mid-fan-out crash re-runs the chain cleanly.
4. Update `docs/architecture.md` (new modules, tables, chain runtime,
   plan insertion semantics), `docs/project-onboarding-guide.md`
   (agent module entry points, env expectations), audit report
   baseline note.
5. Full `bun run check` + `bun run check:boundaries`; fix fallout.

DoD: all checks green; docs current; this directory's README gains a
"status: implemented through M12" note.

---

## Deferred (do not build in v1, keep seams)

- v2: compiler-feedback regeneration round; per-shot frame
  pre-generation (image tasks per storyboard frame); profile slots per
  semantic video mode.
- v3: revision chains over persisted plans
  (`supersedes_plan_id`), per-item regenerate from the plan card.
- v4: tool-loop production agent reusing compiler functions as tools.
- Story-video table node (Lumina's shot table) — reconsider once plan
  cards prove insufficient.
