# 任务清单: 工作流画布性能与协作同步重构

目录: `helloagents/history/2026-05/202605200314_workflow_canvas_performance_collab/`

---

## 0. 基线与诊断
- [√] 0.1 在 `apps/web/src/features/workflow-canvas` 增加开发期性能探针，记录 `onNodesChange`、document commit、autosave、WS message、节点 render 次数。
- [√] 0.2 准备 20/100/500 节点测试数据，覆盖图片节点、视频 poster 节点、文本节点、边连接。
- [√] 0.3 用 Chrome Performance 和 React Profiler 记录当前拖拽、pan、zoom、保存链路基线。备注: `tests/scripts/workflow-canvas-performance-evidence.ts` 生成 Chromium trace 与 React Profiler commit 摘要，覆盖 20/100/500 节点 drag/pan/zoom/save；产物在 `artifacts/performance/`。

## 1. 正确性修复
- [√] 1.1 在 React Flow handler 中确保所有 `NodeChange[]` 都应用到 render state，语义对齐 `applyNodeChanges`。
- [√] 1.2 增加拖拽基线记录，拖拽中更新渲染位置但不推进 dirty。
- [√] 1.3 拖拽结束比较基线和最终位置，变化时强制提交一次 document transaction 并推进 `draftRevision`。
- [√] 1.4 验证拖拽流畅后 autosave、保存按钮、刷新后位置恢复均正常。备注: `bun run test:e2e -- tests/workflow-canvas.spec.ts --project=chromium` 覆盖拖拽中无 autosave、拖拽停止一次 document commit、autosave/manual save、API 持久位置、刷新后 Yjs/document parity。

## 2. 状态分层重构
- [√] 2.1 新建 render state/adapter，负责 `flowNodes`、`flowEdges` 和 React Flow 高频变更。
- [√] 2.2 将业务 graph store 收敛为 document state，只处理可持久化 transaction。
- [√] 2.3 增加 cached projection，单节点业务变更只重建单个 flow node。
- [√] 2.4 移除拖拽帧对业务 store 全量 `nodes.map(toFlowNode)` 的依赖。

## 3. 节点渲染优化
- [√] 3.1 审计所有节点组件，移除对全量 `nodes`/`edges` 的订阅。
- [√] 3.2 节点组件从 `node.data` 或按 id 的窄 selector 读取展示数据，保证未变化字段返回稳定引用。
- [√] 3.3 保持图片节点静态资源展示，补齐固定尺寸、lazy loading、async decoding、resource id memo。
- [√] 3.4 视频节点默认只渲染 poster/封面，播放型 `<video>` 只在详情面板或媒体查看器中挂载。

## 4. 保存与 WS 链路整理
- [√] 4.1 autosave 只监听 document commit revision，不监听 render state。
- [√] 4.2 WebSocket effect 只依赖连接参数，dirty/version/selection 通过 ref 或 store snapshot 获取。
- [√] 4.3 远端 workflow version/media view 更新进入 document transaction，避免覆盖本地拖拽中的 render state。
- [√] 4.4 增加保存失败、远端更新、正在拖拽时远端更新的回归用例。备注: Playwright 覆盖保存失败后保持 Unsaved 并可手动重试恢复；`remote-drag-reconciliation.spec.ts` 覆盖本地拖拽中远端 snapshot 不覆盖 render frame、拖拽结束后再调和；后端协作用例覆盖远端 Yjs update/presence/重启恢复。

## 5. React Flow + Yjs + y-websocket 协作
- [√] 5.1 引入 `yjs` 和 `y-websocket`，实现 workflow room 连接原型。
- [√] 5.2 定义 Yjs 文档结构：`nodes`、`nodeOrder`、`edges`、`edgeOrder`、`meta`。
- [√] 5.3 定义 Awareness：user、cursor、viewport、selection、dragging。
- [√] 5.4 将本地 document transaction 映射到 Yjs transaction。
- [√] 5.5 将远端 Yjs update 映射回 document state 和 render state。
- [√] 5.6 后端增加 y-websocket room 鉴权、update 持久化和 snapshot 导出。
- [√] 5.7 双 tab 验证节点增删、连线、拖拽、配置编辑、断线重连和冲突场景。

## 6. 大画布策略
- [√] 6.1 按节点数量和实测数据决定 `onlyRenderVisibleElements` 阈值。
- [√] 6.2 如果引入 MiniMap，按节点数量和交互状态降级或暂停 MiniMap 重计算。备注: 条件项不适用；代码搜索确认当前未引入 MiniMap，因此无需降级逻辑。
- [√] 6.3 大量节点下保持 pan/zoom/drag 的帧率指标，并记录开启/关闭可见元素裁剪的对比。备注: 500 节点 Playwright 覆盖可见元素裁剪下 pan/zoom 无 document commit/autosave、drag 中无 autosave/未拖节点不重渲染、drag stop 一次 document commit；性能摘要记录 20/100/500 节点 phase counters 和 profiler durations。

## 7. 上线与回滚
- [√] 7.1 用 feature flag 分阶段启用 render/document 分层。备注: render/document 分层按“不背历史包袱”直接启用；协作链路增加 `VITE_WORKFLOW_CANVAS_SYNC_MODE=primary|shadow|disabled` 运行时开关，REST snapshot 仍为回滚路径。
- [√] 7.2 Yjs 协作先以 shadow sync 上线，对比 REST snapshot 与 Yjs export snapshot。
- [√] 7.3 确认一致性后再切换协作主链路。备注: 默认 `VITE_WORKFLOW_CANVAS_SYNC_MODE=primary`，页面从 `/collab/snapshot` hydrate 并通过 Yjs room 进行实时协作；REST snapshot 保留为保存、导出和回滚兼容路径。
- [√] 7.4 保留 REST snapshot 保存作为导出和回滚路径。

## 验收标准
- [√] 节点拖拽不卡顿，拖拽中不触发 autosave。
- [√] 拖拽停止后只提交一次 dirty revision，并能自动保存。
- [√] 画布 pan/zoom 不触发 workflow dirty。
- [√] WebSocket 不因本地 selection/dirty 改变反复重连。
- [√] 图片节点仍显示真实图片预览。
- [√] 视频节点默认不挂载 `<video>`，只显示 poster。
- [√] 双 tab 协作中能看到远端 presence 和最终文档变更。

## 执行验证记录
- `bun run typecheck:web` 通过。
- `bun run typecheck:api` 通过。
- `bun run build:web` 通过。
- `bun run build:api` 通过。
- `bun test apps/web/src/features/workflow-canvas/render/drag-session.spec.ts apps/web/src/features/workflow-canvas/render/flow-projection-cache.spec.ts apps/web/src/features/workflow-canvas/sync/yjs/yjs-document.spec.ts apps/web/src/features/workflow-canvas/utils/performance-fixture.spec.ts` 通过。
- `bun test apps/web/src/features/workflow-canvas/render/drag-session.spec.ts apps/web/src/features/workflow-canvas/render/flow-projection-cache.spec.ts apps/web/src/features/workflow-canvas/sync/yjs/yjs-document.spec.ts apps/web/src/features/workflow-canvas/utils/performance-fixture.spec.ts apps/web/src/features/workflow-canvas/store/remote-drag-reconciliation.spec.ts` 通过。
- `bun test apps/web/src/features/workflow-canvas/store/document-transactions.spec.ts apps/web/src/features/workflow-canvas/store/remote-drag-reconciliation.spec.ts apps/web/src/features/workflow-canvas/utils/react-flow-persistence.spec.ts` 通过。
- `bun test apps/api/src/modules/workflows/workflow-collaboration.routes.test.ts apps/api/src/modules/workflows/collaboration/workflow-yjs-room.service.test.ts` 通过。
- `bun run test:e2e -- tests/workflow-canvas.spec.ts --project=chromium` 通过，覆盖拖拽保存刷新、未拖节点 render count、selection drag、保存失败重试、Yjs parity、500 节点可见元素裁剪 pan/zoom/drag counters。
- `bun tests/scripts/workflow-canvas-performance-evidence.ts` 通过，生成 `artifacts/performance/workflow-canvas-performance-summary.json` 和 20/100/500 节点 Chromium trace。
- `bun --filter @mina/api db:push -- --explain` 通过，并生成 `workflow_yjs_snapshots`、`workflow_yjs_updates`、索引和外键 SQL。
- `bun --filter @mina/api db:push -- --force` 已将新增 Yjs 持久化表应用到当前开发数据库；随后再次运行 `bun --filter @mina/api db:push -- --explain` 显示 `No changes detected`。
- Chrome trace 和 React Profiler commit 摘要已自动化生成；如上线流程要求 React DevTools UI flamechart 截图，可基于同一 trace/fixture 另行导出人工附件。
- 方案包已从 `helloagents/plan/202605200314_workflow_canvas_performance_collab/` 迁移至 `helloagents/history/2026-05/202605200314_workflow_canvas_performance_collab/`。
