# 任务清单: Workflow Canvas Yjs 单一事实源重构

目录: `helloagents/plan/202605201040_workflow_canvas_yjs_ssot/`

---

## 1. 服务端 Yjs 协作核心
- [√] 1.1 在 `apps/api/src/modules/workflows/collaboration/workflow-yjs-room.service.ts` 中重构 sync update 处理，确保所有修改 server ydoc 的 update 都先持久化再广播，验证 why.md#需求-多-client-同画布实时一致-场景-a-移动节点-bc-同步显示。
- [√] 1.2 在 `apps/api/src/modules/workflows/collaboration/workflow-yjs-room.service.ts` 中补齐 `messageYjsSyncStep2` 客户端 update 的持久化/广播或统一 doc update 监听路径，依赖任务1.1。
- [√] 1.3 在 `apps/api/src/modules/workflows/collaboration/workflow-yjs-room.service.ts` 中增加 workflowId 级串行化，覆盖 update append、snapshot compaction、read model 更新，依赖任务1.1。

## 2. 服务端 checkpoint/read model
- [√] 2.1 在 `packages/contracts/src/modules/workflows/workflow.schemas.ts` 中调整 `CheckpointWorkflowCollaborationSchema`，移除 `stateUpdate` 作为常规请求字段。
- [√] 2.2 在 `apps/api/src/modules/workflows/workflow-collaboration.routes.ts` 中把 checkpoint 改为 server-side compaction/read-model refresh，不接收 client full state，依赖任务2.1。
- [√] 2.3 在 `apps/api/src/modules/workflows/workflows.service.ts` 中新增或调整从 server ydoc 导出的 definition read model 更新方法，避免与普通 REST update 的 version 语义混用，依赖任务2.2。

## 3. Yjs 文档模型与兼容导入
- [√] 3.1 在 `apps/web/src/features/workflow-canvas/sync/yjs/yjs-document.ts` 和 `apps/api/src/modules/workflows/collaboration/workflow-yjs-document.ts` 中定义运行时禁止 full re-import 的 API 边界。
- [√] 3.2 在前后端 Yjs document 模块中实现兼容导入器，仅用于 server cold load 和测试 fixture；保存成功路径不调用。
- [√] 3.3 在前后端 Yjs document 模块中为 `nodeOrder`/`nodes`、`edgeOrder`/`edges` 增加一致性导出校验，避免空 order 导出空画布。

## 4. 前端 Yjs SSOT 管线
- [√] 4.1 新建 `apps/web/src/features/workflow-canvas/sync/yjs/workflow-yjs-store.ts`，集中管理 live ydoc 和当前投影快照；provider connection status 投影到 canvas store。
- [√] 4.2 新建或重构 command API，使 `moveNodes`、`upsertNode`、`updateNode`、`connectMediaSlot`、`removeNodes`、`removeEdges` 直接写 Yjs，依赖任务4.1。
- [√] 4.3 在 `apps/web/src/features/workflow-canvas/sync/yjs/yjs-sync.ts` 中移除 shadow 双向同步职责，改为 ydoc observe -> projection store 的单向同步，依赖任务4.1。

## 5. 前端 store 与交互改造
- [√] 5.1 在 `apps/web/src/features/workflow-canvas/store/store-types.ts`、`draft-slice.ts`、`hydration-slice.ts` 中删除协作图状态的 `documentTransactions`、`draftRevision`、`savedRevision` 依赖。
- [√] 5.2 在 `apps/web/src/features/workflow-canvas/store/slices/graph-slice.ts` 中将图 mutation action 改为调用 Yjs command，或迁移调用方直接使用 command API，依赖任务4.2。
- [√] 5.3 在 `apps/web/src/features/workflow-canvas/react-flow/use-workflow-flow-handlers.ts` 中让拖拽停止、节点增删、边连接直接提交 Yjs command，依赖任务5.2。
- [√] 5.4 在 `apps/web/src/features/workflow-canvas/components/WorkflowCanvas.tsx` 和 render store 中保持 React Flow 渲染从 projection store 派生，不直接读旧 graph mutation state，依赖任务4.3。

## 6. 保存状态和页面 hydrate
- [√] 6.1 在 `apps/web/src/features/workflow-canvas/hooks/use-workflow-autosave.ts` 中删除 full graph save/checkpoint stateUpdate/reconcile 路径，改为 server ack/compaction 状态。
- [√] 6.2 在 `apps/web/src/features/workflow-canvas/components/WorkflowCanvasPage.tsx` 中调整初始加载逻辑：协作模式以 Yjs WS sync 初始化为准，不因 definition updated 对图状态 REST hydrate。
- [√] 6.3 在 save status UI 中用 provider connection/sync 状态与 dirty/saving 状态描述保存状态，依赖任务6.1。

## 7. 运行与媒体相关兼容
- [√] 7.1 在 workflow run 创建前确保服务端从 ydoc 导出最新 read model，避免运行使用旧 `workflows.nodes/edges`。
- [√] 7.2 检查 `setNodeMediaView`、task config、media slots 的写路径，迁移到 Yjs command 或明确非协作 read model 更新边界。
- [√] 7.3 验证 workflow events 只用于任务/运行/media view 等非图状态通知，不再触发协作图 hydrate。

## 8. 测试
- [√] 8.1 更新 `apps/api/src/modules/workflows/collaboration/workflow-yjs-room.service.test.ts`，覆盖 sync step2 持久化、广播排除 sender、restart restore、checkpoint compaction。
- [√] 8.2 更新 `apps/api/src/modules/workflows/workflow-collaboration.routes.test.ts`，覆盖 checkpoint 不接受 client full state、read model 从 server ydoc 导出。
- [√] 8.3 更新 `apps/web/src/features/workflow-canvas/sync/yjs/*.spec.ts`，覆盖禁止运行时 re-import、projection 单向同步、order/map 一致性 guard。
- [√] 8.4 增加多 client 前端集成测试：A/B 同步拖拽、新增节点、配置交互、保存失败恢复、重连后一致；当前 Playwright 覆盖双 client，未额外扩到第三个 browser context。

## 9. 安全检查
- [√] 9.1 执行权限检查：WS token、workflow ownership、room id mismatch、跨账号访问。
- [√] 9.2 执行输入检查：Yjs update size limit、客户端 command dry-run graph validation、checkpoint 全量 schema validation、非法 graph 不进入 read model。
- [√] 9.3 执行持久化一致性检查：广播前 append 成功、compaction 后 snapshot/update 恢复顺序稳定。

## 10. 文档与清理
- [√] 10.1 更新 `helloagents/wiki/modules/workflows.md`，记录 Yjs SSOT 协作架构。
- [√] 10.2 更新 `helloagents/wiki/arch.md`，加入 ADR-001/002/003 索引。
- [√] 10.3 删除或归档旧 shadow sync、REST full save、remote snapshot dirty guard 相关测试和文档，确保没有旧路径残留。

---

## 执行备注
- 服务端 Yjs update 先 append 再 apply/broadcast；客户端 command 侧先 dry-run 校验，服务端 checkpoint/read-model refresh 再执行全量 graph schema validation。
- 本阶段移除了旧 shadow/full-save 生产路径；nested Y.Map/Y.Text 细粒度字段拆分仍属于后续模型深化，不作为本次阻塞项。
- `/collab/snapshot` 保留为服务端诊断/初始化端点，前端生产链路不再调用。


## 任务状态符号
- `[ ]` 待执行
- `[√]` 已完成
- `[X]` 执行失败
- `[-]` 已跳过
- `[?]` 待确认
