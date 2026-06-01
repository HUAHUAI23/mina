# Workflow Canvas Media Runtime

This document records the media preview runtime rules used by workflow
canvas image and video generation nodes.

## Responsibilities

Media generation has three separate concerns:

- **Provider execution** creates task outputs.
- **Media preview state** chooses which task and output resource a node
  displays.
- **Media element lifecycle** decides when heavyweight browser media
  elements, such as `<video>`, are mounted.

Keeping these concerns separate prevents provider-specific behavior from
leaking into workflow orchestration or collaborative canvas state.

## Image Output Count

`params.count` is a Mina-level output request count. For Volcengine
Seedream it is implemented as repeated vendor calls, not as a single
vendor request parameter.

The provider adapter owns this behavior:

- `VolcengineSeedreamSpec.start()` performs one vendor image generation
  call per requested output.
- Successful vendor responses are flattened into one task output with
  `generated_image` resources indexed from zero.
- If at least one vendor call succeeds, the task provider result is
  `succeeded`.
- If every vendor call fails or returns no image, the task provider
  result is `failed`.
- Partial failures are recorded in provider metadata instead of adding a
  new task status.

This preserves the existing task status contract:

```text
queued | running | succeeded | failed | cancelled
```

For partial outputs, metadata records the observable counts:

```ts
{
  requestedImageCount: number
  succeededImageCount: number
  failedImageCount: number
  partialFailures?: Array<{ attempt: number; message: string }>
}
```

Actual usage uses the number of successfully produced images when the
provider does not return a more specific compatible usage metric. This
lets task cost scale down when a multi-output image task partially
succeeds.

## Video Poster Selection

Video posters are an optimization, not a requirement for playing a
video. A video resource with a usable preview URL is enough to mount and
play `<video>` after user interaction.

Poster selection follows this priority:

1. `video_cover`
2. `first_frame`
3. `last_frame`

When frame metadata links a frame to the selected `generated_video`, the
linked frame wins. For single-video task outputs, an unlinked provider
frame with the requested role is accepted as belonging to that video.
For multi-video outputs, unlinked frames are not assigned to a selected
video because that would be ambiguous.

This matches the backend post-processing rule: single-video outputs can
accept provider-returned frames without explicit source metadata, while
multi-video outputs require source linkage.

Generated frame resources are real media objects. For finalized task
outputs, the backend frame generator must resolve the stored video media
object to a temporary readable URL before invoking `ffmpeg`; it must not
treat internal `s3://` object URLs as browser- or ffmpeg-readable media.
If the poster frame cannot be extracted, `video_cover` may fall back to a
valid JPEG placeholder and must mark the resource metadata with
`derivativeStatus: "fallback"` and a `fallbackReason`.

`first_frame` and `last_frame` are semantic workflow resources, not just
UI thumbnails. They must not be silently replaced with placeholder
images. If one of these required frames cannot be extracted, the task
completion path should fail instead of exposing a fake frame to downstream
flow-group `run_output` consumers.

During active development, old broken task outputs are not repaired in
place. Re-run the affected task or clear development data instead of
keeping a compatibility repair script.

## Video Element Lifecycle

Canvas video previews do not mount `<video>` by default. The default
state is a poster image, or a neutral video placeholder if no poster is
available.

`<video preload="metadata">` is mounted only after the user clicks play.
The canvas then keeps at most one active video node:

- Starting playback on one video marks that node active.
- Starting playback on another video replaces the active node.
- Changing the selected video resource clears the active node.
- Moving the node outside the viewport visibility margin clears the
  active node.
- Unmounting the preview clears the active node.
- If the canvas viewport starts moving while the mounted video is
  paused, the active node is cleared.

The active video id is ephemeral client state in a small Zustand store.
It is not persisted and is not synchronized through Yjs.

## History Rail Thumbnails

The history rail displays primary task outputs only:

- Image tasks show `generated_image` resources.
- Video tasks show `generated_video` resources.

For video task thumbnails, the rail renders the selected video's poster
image when available. It never mounts `<video>` inside the history rail.
If no poster image is available, it falls back to the compact video
placeholder.

## Output Strip

The node output strip intentionally uses primary output resources, not
all media resources:

- Image generation: `generated_image`
- Video generation: `generated_video`

Frame resources such as `video_cover`, `first_frame`, and `last_frame`
are supporting preview assets. They should not be mixed into the primary
output strip because that would blur the distinction between selecting a
video output and selecting one of its preview frames.

## Run Output Selection

Flow-group `run_output` selectors use role-local indexing. A selector
such as:

```ts
{ resourceKind: 'image', role: 'first_frame', index: 0 }
```

means "the first `first_frame` image", not "the resource whose global
`resource.index` is 0". This keeps generated videos, covers, first frames,
and last frames composable even when their stored resource indexes are
globally ordered inside `task.output.resources`.

## Collaboration Boundary

Explicit media selection is collaborative state:

```ts
node.data.mediaView
```

It is written through Yjs so all collaborators see the same pinned
historical task or output resource.

Runtime facts such as latest task id, live task status, and active video
playback are not collaborative document state. They are local projections
from runtime events, workflow detail snapshots, and direct user
interaction.
