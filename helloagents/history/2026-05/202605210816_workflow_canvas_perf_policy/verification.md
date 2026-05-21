# 验收核对: Workflow Canvas 性能策略与公共资源权限加固

日期: 2026-05-21

## 已执行验证
- `bun --filter @mina/web typecheck`
- `bun --filter @mina/contracts typecheck`
- `bun --filter @mina/contracts build`
- `bun --filter @mina/api typecheck`
- `bun test apps/web/src/features/workflow-canvas/render/flow-render-store.spec.ts apps/web/src/features/workflow-canvas/render/flow-projection-cache.spec.ts apps/web/src/features/workflow-canvas/render/flow-performance-policy.spec.ts apps/web/src/features/workflow-canvas/store/remote-drag-reconciliation.spec.ts apps/web/src/features/workflow-canvas/utils/performance-fixture.spec.ts apps/web/src/features/workflow-canvas/sync/yjs/yjs-document.spec.ts apps/api/src/modules/accounts/authorization.test.ts apps/api/src/index.test.ts`
- `bun --filter @mina/web build`
- `bun --filter @mina/api build`
- `bun run check:boundaries`
- `git diff --check`
- CSS 高成本关键词扫描：`backdrop-filter|filter: drop-shadow|filter: blur|animation: mina|transition:|mix-blend-mode|mask-image` 无残留。
- 临时 registry barrel/import 和 `graph-actions` 扫描无残留。

## 残留说明
- 媒体 slot 拖拽仍使用 dnd-kit 提供的 transform 做定位，这是拖拽库的必要位置表达；本次移除了 transition 动画，不再做 transform 动画。
