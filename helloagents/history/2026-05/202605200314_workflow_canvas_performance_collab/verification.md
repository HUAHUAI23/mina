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

## 性能证据

- `artifacts/performance/workflow-canvas-performance-summary.json` 记录 20/100/500 节点 dragMove、dragStopAndSave、panZoom 三阶段 counters、React Profiler commit 数量和最大 `actualDuration`。
- `artifacts/performance/workflow-canvas-20-nodes.trace.json`
- `artifacts/performance/workflow-canvas-100-nodes.trace.json`
- `artifacts/performance/workflow-canvas-500-nodes.trace.json`
- 如上线流程要求 React DevTools UI flamechart 截图，可基于同一 fixture 另行导出人工附件；当前仓库内已有自动化 Chrome trace 与 React Profiler callback 摘要。
