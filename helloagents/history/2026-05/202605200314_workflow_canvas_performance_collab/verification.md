# 验收核对: 工作流画布性能与协作同步重构

日期: 2026-05-20

## 设计目标核对

- 节点拖拽、selection drag、pan、zoom 响应性: 已由 render/document 分层、drag session、Playwright 20/500 节点拖拽和 500 节点 pan/zoom counters 覆盖。
- autosave、manual save、workflow version、WebSocket freshness: 已由 revision-based autosave、稳定 WebSocket effect、Playwright 保存/刷新/失败重试和 API 协作测试覆盖。
- 图片预览保留: 图片节点仍渲染 `img`，并使用 lazy loading、async decoding、不可拖拽图片元素。
- 视频 poster 默认渲染: 画布节点不挂载 `<video>`；视频节点使用 poster/placeholder。
- 避免 broad subscriptions: 节点显示数据来自 flow node `data` 和窄 runtime/media preview store；Playwright 验证拖拽时未拖节点 render count 不增长。
- 受控 React Flow 正确性: `onNodesChange` / `onEdgesChange` 先写 render store；拖拽停止才提交 document transaction。
- React Flow + Yjs + y-websocket 路径: 已增加 frontend Yjs shadow sync、awareness、后端鉴权 room、updates/snapshots 持久化和 restart restore。
- 可度量性能目标与回归检查: 已增加 dev counters、React Profiler commit collection、render counts、20/100/500 fixture、1000-node stableCanvas spec、Playwright e2e、Chromium trace 产物。

## Definition of Done 核对

- 节点拖拽不触发 autosave，拖拽停止后 autosave: `tests/workflow-canvas.spec.ts`。
- 拖拽停止一次最终位置 transaction: `documentCommits` 计数和 API 持久位置断言。
- pan/zoom 不 dirty: 500-node Playwright 用例断言 document/autosave counters 不变。
- autosave/manual save/refresh/reload 正确: Playwright 拖拽保存刷新和保存失败重试用例。
- WebSocket 不因本地 canvas state 重连: workflow event socket effect 仅依赖 workflow id，Playwright counters 覆盖交互期间不重连。
- 图片预览稳定、视频 poster 默认: 组件实现和搜索审计 `rg "data\.runtime|<video"` 无画布回归。
- 节点 render counts: dev-only `__minaWorkflowCanvasRenderCounts`，Playwright 拖拽用例验证未拖节点计数不增长。
- projection cache 单节点变化不全量重建: `flow-projection-cache.spec.ts`。
- 持久化序列化排除 React Flow transient 字段: `react-flow-persistence.spec.ts`。
- Yjs shadow snapshot parity: `yjs-document.spec.ts` 和 Playwright `matchesDocument()`。
- collaboration primary/auth/persistence/awareness/rollback path: API collaboration route/service tests、Playwright 断言页面请求 `/collab/snapshot` 并在刷新后保持图状态，REST snapshot 仍保留为保存/导出/回滚路径，协作链路可由 `VITE_WORKFLOW_CANVAS_SYNC_MODE=primary|shadow|disabled` 切换。

## 2026-05-20 协作/config 回归修复补充

- 协作文档新增 `nodeFrames`，将位置/尺寸/父子 frame 从节点 config 数据中拆出，避免 stale `update_node` 覆盖远端移动。
- 删除边/节点改为 `remove_edges` / `remove_nodes` 粒度事务，避免普通删除使用 `replace_snapshot` 清空或回退协作者新增状态。
- dirty 本地草稿收到远端 snapshot 时只标记 remote pending，不直接覆盖本地画布；Yjs shadow sync 会重放本地 pending transaction。
- 保存从 live Yjs 合并快照导出，并用 Yjs update revision 防止保存请求期间的新远端更新被旧 REST 响应反向覆盖。
- 后端协作 room 在最后一个连接断开后延迟清理，修复保存后立即 reload 时 primary collaboration snapshot 读到空图的竞态。
- Playwright 增加双页面协作场景：一页打开 config 并编辑 prompt，另一页移动同一节点，断言 config 不关闭、节点不消失、位置持久化、Yjs/document parity 保持一致。

## 2026-05-20 新协作架构落地补充

- primary 协作模式改为 Yjs 单一持久图源：本地 canvas document transaction 立即写入 live Yjs，REST `PUT /api/workflows/:id` 不再承担 primary 保存。
- 新增 `POST /api/workflows/:id/collab/checkpoint`，服务端先应用请求携带的客户端 encoded Yjs state update，再从当前 Yjs room 导出规范化图快照，替换 workflow definition 并推进版本号，避免 HTTP checkpoint 早于 WebSocket update 到达时导出旧图。
- autosave/manual save 改为调用 server-side checkpoint；保存请求期间若 live Yjs update revision 变化，会再次 checkpoint 或避免旧响应覆盖画布，解决 A/B 快速接力移动时位置回退。
- checkpoint 成功且 revision 未被并发更新打断时，前端先将服务端返回快照 reconcile 回 live Yjs，再 acknowledge store saved，避免新增图片节点等操作在 Saved 后因本地 Yjs/store 基准不一致而消失或 parity 失败。
- MediaView 输出选择改为 canvas/Yjs document transaction，避免 primary 模式继续走 version-sensitive REST media-view patch。
- Yjs `move_nodes` 只写 `nodeFrames`，不再写整份 stale node，防止拖拽覆盖并发 config 编辑。
- 开发 render count 诊断改为业务内容签名计数，覆盖“拖拽中未拖节点业务内容不重绘”，避免 React Flow wrapper 重入误报。

## 性能证据

- `artifacts/performance/workflow-canvas-performance-summary.json` 记录 20/100/500 节点 dragMove、dragStopAndSave、panZoom 三阶段 counters、React Profiler commit 数量和最大 `actualDuration`。
- `artifacts/performance/workflow-canvas-20-nodes.trace.json`
- `artifacts/performance/workflow-canvas-100-nodes.trace.json`
- `artifacts/performance/workflow-canvas-500-nodes.trace.json`
- 如上线流程要求 React DevTools UI flamechart 截图，可基于同一 fixture 另行导出人工附件；当前仓库内已有自动化 Chrome trace 与 React Profiler callback 摘要。

## 本次补充验证

- `bun run typecheck:web` 通过。
- `bun run typecheck:api` 通过。
- `bun run typecheck:contracts` 通过。
- `for spec in $(rg --files apps/web/src/features/workflow-canvas | rg '\.spec\.ts$'); do bun "$spec" || exit 1; done` 通过。
- `bun test apps/api/src/modules/workflows/workflow-collaboration.routes.test.ts apps/api/src/modules/workflows/collaboration/workflow-yjs-room.service.test.ts apps/api/src/modules/workflows/workflows.service.test.ts` 通过。
- `bun run test:e2e -- tests/workflow-canvas.spec.ts --project=chromium` 通过。
