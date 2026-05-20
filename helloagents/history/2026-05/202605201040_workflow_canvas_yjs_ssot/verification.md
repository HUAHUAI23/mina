# 验收核对: Workflow Canvas Yjs 单一事实源重构

日期: 2026-05-20

## 设计目标核对

- Yjs 成为 workflow canvas graph 单一事实源：前端 graph/media/task action 已改为 Yjs command；Zustand 只保留投影和 UI 状态。
- 删除双写/回声链路：autosave/checkpoint 不再发送 `stateUpdate`，保存成功不再把 plain snapshot import 回 client ydoc。
- 服务端协作权威化：Yjs update 由 room 串行持久化、apply、广播给其他 client；checkpoint 对 server ydoc 导出的 graph 做全量校验。
- checkpoint 语义收敛：`POST /collab/checkpoint` 只做 server room ydoc validation、compaction、state-vector ack 与 workflow definition read model refresh。
- 并发串行化：update append、snapshot compaction、read model refresh 进入 workflowId 级锁。
- 运行前一致性：创建 workflow run 前先从 server ydoc checkpoint 最新 read model。
- 前端同步状态：SaveStatusPill 结合 Yjs provider connection/sync 状态与 dirty/saving 状态显示 Syncing/Offline/Saved/Unsaved/Saving。

## 关键清理

- 删除旧 `documentTransactions`、`draftRevision`、`savedRevision`、`lastDocumentTransaction` 图状态队列。
- 删除旧 `yjs-transactions.ts`、`RemoteUpdateBanner`、web collaboration snapshot client、REST media-view patch repository 方法。
- 移除 `VITE_WORKFLOW_CANVAS_SYNC_MODE`；开发阶段不再保留 shadow/disabled 协作模式开关。
- 移除公开 full-graph `PUT /api/workflows/:id` 与 web `saveWorkflow` wrapper，避免协作图状态绕过 Yjs SSOT。
- `/collab/snapshot` 仅保留服务端诊断/初始化用途，前端生产链路不再调用。

## 验证命令

- `bun run typecheck:api` 通过。
- `bun run typecheck:web` 通过。
- `bun run typecheck:contracts` 通过。
- `bun --filter @mina/api test` 通过：89 pass，1 skip。
- `bun run check:boundaries` 通过。
- `bun test apps/api/src/modules/workflows/collaboration/workflow-yjs-room.service.test.ts apps/api/src/modules/workflows/workflow-collaboration.routes.test.ts` 通过：10 pass。
- `bun test apps/web/src/features/workflow-canvas/store/hydration-slice.spec.ts apps/web/src/features/workflow-canvas/sync/yjs/yjs-document.spec.ts apps/web/src/features/workflow-canvas/render/flow-render-store.spec.ts apps/web/src/features/workflow-canvas/store/remote-drag-reconciliation.spec.ts apps/web/src/features/workflow-canvas/utils/react-flow-persistence.spec.ts` 通过。
- `bun run test:e2e tests/workflow-canvas.spec.ts --project=chromium` 通过：9 pass。
- `bun run typecheck && bun run check:boundaries` 通过。

## 残留说明

- Yjs 文档仍以 object value 存储节点配置；nested `Y.Map` / `Y.Text` 字段级 CRDT 拆分是后续模型深化，不影响本次 SSOT/无回声架构目标。
- 旧历史包中保留此前 shadow/rollback 记录作为历史事实；当前 wiki、changelog 和本方案包以新架构为准。
