# Change History Index

| Date | Change | Status | Notes |
| --- | --- | --- | --- |
| 2026-05-15 | Media object workflow input architecture implementation | Complete | Implemented from `docs/design/media-object-workflow-input-architecture.md` |
| 2026-05-20 | Workflow canvas performance/collaboration refactor | Complete | Implemented render/document split, projection cache, drag commit boundary, poster-only video nodes, diagnostics/render counts/React Profiler commits, Playwright canvas regressions, Chromium trace evidence, Yjs transaction/shadow mapping with runtime toggle, authenticated y-websocket-compatible room, Yjs update persistence/snapshot compaction, and protocol-level double-client collaboration verification from `docs/design/workflow-canvas-performance-collaboration-refactor-guidance.md`. |
| 2026-05-20 | Workflow canvas Yjs single source of truth refactor | Complete | Replaced shadow/full-save collaboration with Yjs SSOT graph commands, one-way Zustand projection, server-side checkpoint validation/compaction/read-model refresh, state-vector save acknowledgement, and multi-client Playwright/API verification. |
| 2026-05-21 | Workflow canvas performance policy and admin public library guard | Complete | Added weighted visible-rendering policy, viewport-gated media node task queries, Yjs node-frame hot-path validation/signature optimization, GPU-costly CSS cleanup, direct registry source imports, and admin-only `public_library` media uploads. |
