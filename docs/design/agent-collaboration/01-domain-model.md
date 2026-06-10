# 01 — Domain Model

## 1. Chain Taxonomy

A **chain** is one invokable AI capability. Every chain declares:

```ts
interface ChainDefinition {
  key: ChainKey
  family: 'conversation' | 'writing' | 'assets' | 'production'
  resultKind: 'text' | 'asset_changes' | 'plan'
  contextNeeds: {
    storyAssets: boolean      // inject the story asset manifest
    generationProfile: boolean
    attachments: boolean      // multimodal: pass uploaded images to the model
  }
  // prompt parts are resolved by the prompt assembler, see 03
}
```

### v1 chain catalog

| Chain key | Family | Result | Notes |
|---|---|---|---|
| `conversation.general` | conversation | text | Default chat; current behavior, now routed through the chain runtime |
| `writing.novel` | writing | text | Long-form fiction drafting |
| `writing.screenplay` | writing | text | Novel/idea → screenplay |
| `writing.storyboard` | writing | text | Screenplay/idea → storyboard document in the **storyboard protocol** (below) |
| `assets.curation` | assets | asset_changes | Chat-driven story asset create/bind/update |
| `production.single_shot` | production | plan | Narrative + optional uploads → one video node, one image node, or an image→video mini-graph |
| `production.storyboard_to_video` | production | plan | Storyboard document → per-shot node groups |

Chain selection: the chat composer sends an explicit `chainKey` with the
message (chip UI). When absent, a lightweight router resolves between
`conversation.general` and a suggested chain; production chains are
**never** auto-selected — they require an explicit user choice because
they consume project context and produce side effects.

Composability rule: `writing.storyboard` **emits** the same storyboard
protocol that `production.storyboard_to_video` **consumes**. The user
can edit the document between the two chains. A document is just
message text; no hidden state connects the chains.

## 2. Story Assets and the Manifest

Story assets are project-scoped creative entities:

- `character` — has images and optional voice references
- `scene` — has images
- `prop` — has images

Each asset has a stable `refKey` (`char_lihua`, `scene_livingroom`,
`prop_beanbag`) generated from a slug of its name plus a type prefix,
unique per project. Each bound image has refKey `img_<shortId>`; each
voice `voice_<shortId>`. Display names are written in the language the
library was curated in — a Chinese project names the character 李华, an
English project names it Li Hua. **The LLM uses display names in prose
and ref keys in references; nothing is translated.**

The **manifest** injected into chain prompts:

```text
## Available assets
character char_lihua (李华): 28-year-old male, casual style…
  images: img_a1b2 [front half-body / face clear / living room] | img_9f3c [side full-body / night]
  voice: voice_c3d4 (primary)
scene scene_livingroom (客厅): dim warm light, TV glowing…
  images: img_77ab [wide / night]
prop prop_beanbag (蚕豆袋): kraft paper snack bag…
  images: img_b8e1 [product front]
```

Manifest building filters to assets relevant to the current input
(name/refKey occurrence match, falling back to the full project list
under a size cap) to control token cost.

## 3. Reference Grammar

One grammar across all chains. In generated text the model may write:

| Token | Meaning |
|---|---|
| `@img_<id>` | A bound story-asset image (by image refKey) |
| `@voice_<id>` | A character voice reference |
| `@upload_<n>` | The n-th attachment the user uploaded with this message |
| `@char_<slug>` `@scene_<slug>` `@prop_<slug>` | A story asset itself (compiler picks its primary image when imagery is required) |

Regex (single source of truth in contracts):

```ts
/@(img|voice|upload|char|scene|prop)_[a-z0-9][a-z0-9-]*/g
```

Rules the system protocol teaches the model:

1. Mention people/places/props by display name in prose; attach the
   asset reference once at first visual occurrence
   (`李华 @img_a1b2 斜靠在沙发上…`).
2. Dialogue lines name the speaker; if the speaker has a voice asset,
   reference it once (`口播(李华 @voice_c3d4): "…"`).
3. Never invent ref keys. Only keys present in the manifest or
   `upload_<n>` are valid; the compiler deletes unknown references and
   records an adjustment.

## 4. Output Protocols (envelopes)

Output protocols are code-built-ins, versioned, not user-editable.
They are intentionally line-oriented, not JSON — the body stays free
prose.

### 4.1 Storyboard protocol (`writing.storyboard` output, `production.storyboard_to_video` input)

```text
#shot 1
duration: 3s
---
<free storyboard text for shot 1, may use @refs>

#shot 2
duration: 12s
---
…
```

`duration` accepts `<n>s` or `default`. Unknown/missing → `default`.

### 4.2 Shot production protocol (per-shot output inside production chains)

```text
duration: 12s
aspect: 9:16            (optional)
plan: t2v | i2v | i2i+video   (single_shot chain only)
---
<final video prompt prose with @refs; segment markers like
【第①段 0-3s】🎥… are stylistic content owned by pluggable modules,
not parsed by the compiler>
```

The parser extracts only the header lines before `---`; everything
after is the creative payload. A malformed envelope triggers exactly
one repair round (the chain re-prompts with the parser error list);
a second failure marks the plan item `failed`.

### 4.3 Asset curation protocol (`assets.curation`)

The only JSON protocol, because the payload **is** a data operation
list:

```json
{ "operations": [
  { "op": "create_asset", "assetType": "character", "name": "李华", "description": "…" },
  { "op": "bind_image", "assetRef": "char_lihua", "upload": 1, "role": "identity_anchor" },
  { "op": "bind_voice", "assetRef": "char_lihua", "upload": 2 },
  { "op": "update_description", "assetRef": "char_lihua", "description": "…" }
] }
```

Operations are validated against the current library and applied
transactionally; the result message summarizes applied/rejected ops.

## 5. Compile Semantics

The compiler is pure and deterministic. Input: parsed envelopes +
creative text + resolved context (story assets, uploads, generation
profile, model capability from the task `ModelRegistry`). Output:
`PlanGraph` + per-item `CompileReport`.

Ordered phases per plan item:

1. **Parse references** — extract `@ref` tokens; resolve against
   manifest/uploads; unknown refs are removed (adjustment:
   `unknown_reference_removed`).
2. **Implicit asset injection** — a character/scene/prop mentioned by
   display name without any image reference gets its primary image
   injected at first occurrence when the compiled mode needs imagery;
   a dialogue speaker with a primary voice gets a voice reference
   (adjustment: `implicit_reference_added`). If a referenced character
   has **no** image at all, the item becomes `blocked` (placeholder
   slot, see phase 7) — or, when the generation profile enables
   generative fallback, the compiler prepends an `image_generation`
   node that creates the character image and wires it as the
   reference.
3. **Slot packing** — assign media inputs in order of first appearance:
   images into the image slot sequence, voices/audio into the audio
   slot sequence. Caps come from the video model spec (e.g. Seedance
   2.0 class models: 9 images / 3 audio). Overflow is truncated from
   the tail (adjustment: `reference_cap_truncated`).
4. **Mode resolution** — `production.single_shot` honors the declared
   `plan:`; `storyboard_to_video` derives the semantic input mode from
   packed slots (no images → `text_to_video`; one+ reference images →
   `reference_images`; explicit first-frame phrasing is a v2 concern).
   If the profile's video model does not support the resolved mode,
   fall back along `reference_images → first_frame → text_to_video`
   (adjustment: `mode_fallback`).
5. **Duration resolution** — envelope duration if present → clamp to
   the model spec's allowed duration set (adjustment:
   `duration_clamped`) → else generation profile
   `defaultDurationSeconds`.
6. **Token rendering** — rewrite each `@ref` occurrence into the
   locale-rendered positional token bound to its packed slot:
   zh-Hans `图1` `图2` `音频1`, en `image1` `audio1`. First-occurrence
   asset mentions render as `李华(图1)` / `Li Hua (image1)`; dialogue
   voice references render as `(声音参考音频1)` /
   `(voice ref audio1)`. The renderer also emits a
   **mention map** (token → slot item key) so the canvas can show
   prompt-to-slot bindings.
7. **Plan-graph build** — emit nodes with `taskDraft` config hydrated
   from the generation profile, `mediaSlots` from packed slots,
   a `flow_group` container when an item has more than one node
   (image→video), and placeholder slot items for blocked references
   (label = the missing asset's display name).

Every adjustment is recorded with a stable code and primitive params —
the chat plan card and the persisted plan item both surface them.

## 6. PlanGraph IR (contracts)

Lives in `@mina/contracts/modules/agent/plan-graph.schemas.ts`. Shapes
mirror the canvas contracts so insertion is a mechanical mapping.

```ts
PlanGraph {
  items: PlanItem[]
}

PlanItem {
  key: string                    // 'shot-1' | 'single'
  title: string                  // '1-开场钩子'
  status: 'planned' | 'blocked' | 'failed'
  group?: { containerType: 'flow_group' | 'node_group'; title: string; note?: string }
  nodes: PlanNode[]
  edges: PlanEdge[]              // visual projection of node_output slot items
  report: CompileReport          // adjustments, lint issues, blockedRefs
}

PlanNode {
  key: string                    // plan-local, e.g. 'shot-1-video'
  nodeType: 'image_generation' | 'video_generation' | 'text'
  title: string
  prompt: string                 // final locale-rendered prompt
  promptMentions?: { token: string; slotItemKey: string }[]
  taskDraft: Record<string, unknown>   // model/provider/params per task contracts
  mediaSlots: PlanMediaSlotItem[]
}

PlanMediaSlotItem {
  key: string                    // stable within the plan, target of promptMentions
  slot: string                   // canvas slot name per media contracts
  order: number
  source:
    | { type: 'media_object'; mediaObjectId: string }
    | { type: 'plan_node_output'; nodeKey: string; outputIndex?: number }
    | { type: 'placeholder'; label: string; expectedKind: 'image' | 'audio' }
}

PlanEdge { fromNodeKey: string; toNodeKey: string }
```

Insertion semantics (see 04): `plan_node_output` becomes a
`node_output/run_output` slot source inside a `flow_group`, or
`current_media` for standalone nodes — matching existing canvas
execution rules. `placeholder` becomes an empty highlighted slot item
the user fills manually.

## 7. Worked Example (compile fixture)

Model output for one shot (zh project):

```text
duration: 15s
---
【第①段 0-3秒】🎥 李华 @img_a1b2 手持手机自拍，斜靠在沙发上，
背景是亮着的电视 @img_77ab，手里拿着一把蚕豆 @img_b8e1，有点慌乱感
🎙️ 口播(李华 @voice_c3d4)：（边嚼边说）"我就说……追个剧怎么把这一袋全嗑完了……"
【第②段 3-6秒】🎥 手机继续手持，拎起空了的牛皮纸袋晃一下…
```

Compiled (zh locale, profile video model supports 9 img / 3 audio,
duration set includes 15):

- slots: `图1=img_a1b2(李华)`, `图2=img_77ab(客厅)`,
  `图3=img_b8e1(蚕豆袋)`, `音频1=voice_c3d4`
- prompt: `【第①段 0-3秒】🎥 李华(图1)手持手机自拍，斜靠在沙发上，
  背景是亮着的电视(图2)，手里拿着一把蚕豆(图3)，有点慌乱感
  🎙️ 口播(李华，声音参考音频1)：（边嚼边说）"我就说……"…`
- node: one `video_generation`, duration 15, mode `reference_images`,
  taskDraft hydrated from profile, four mediaSlot items, four
  promptMentions.

The same fixture with an English-curated library renders
`Li Hua (image1)` … `(voice ref audio1)` with no other changes —
token rendering is the only locale-sensitive step.

## 8. Explicitly Out of Scope for v1

- First/last-frame storyboard image pre-generation per shot (Lumina's
  image-task fan-out). v1 relies on reference-image modes plus the
  character generative fallback; frame-level pre-generation is a v2
  compiler phase.
- Tool-loop agents. The chain runtime is fixed orchestration; the
  compiler feedback loop (v2) and revision chains (v3) come first.
- Auto-routing to production chains.
- Cross-project asset sharing.
