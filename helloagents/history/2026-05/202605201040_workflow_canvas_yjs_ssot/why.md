# 变更提案: Workflow Canvas Yjs 单一事实源重构

## 需求背景
当前 `apps/web/src/features/workflow-canvas` 的协作实现同时维护 Zustand 画布状态、Yjs shadow document、REST checkpoint 返回的 plain snapshot、数据库 workflow definition。多份状态互相全量导入和回写，导致同一画布在多个 client 下出现节点复原、远端编辑覆盖、本地未保存事务被吞、画布短暂无节点、保存回声和潜在死循环。

这不是单点缺陷，而是事实源和操作日志重复造成的架构问题。开发阶段应直接重构为协作优先模型：Yjs document 是画布结构的唯一事实源，React/Zustand 只消费它的投影。

## 变更内容
1. 将 workflow canvas 的协作图状态收敛到 Yjs document，移除 Zustand `documentTransactions` 作为第二套 op log。
2. 移除保存成功后的 plain snapshot 回写 ydoc，以及 `clear + re-import` 触发的全量广播路径。
3. 将服务端 collaboration room 调整为 Yjs update 的持久化与同步中心，checkpoint 只做 binary snapshot compaction。
4. 将 UI 操作入口改为直接写 Yjs，store/render layer 通过 ydoc observe 单向派生。
5. 重写保存状态语义：从“保存 RPC 是否成功”改为“本地 Yjs update 是否已被服务端 ack/持久化”。
6. 补齐多 client、重连、并发拖拽、并发字段编辑、房间清理后的集成测试。

## 影响范围
- **模块:** workflow-canvas、workflow collaboration API、workflow Yjs room service、workflow persistence。
- **前端文件:** `apps/web/src/features/workflow-canvas/sync/yjs/*`、`store/*`、`hooks/use-workflow-autosave.ts`、`components/WorkflowCanvasPage.tsx`、`react-flow/use-workflow-flow-handlers.ts`。
- **后端文件:** `apps/api/src/modules/workflows/collaboration/*`、`workflow-collaboration.routes.ts`、`workflows.service.ts`。
- **API:** `/api/workflows/:id/collab/:room` 保留为核心同步通道；`/collab/checkpoint` 改为 compaction/ack 语义或下线前端依赖；`/collab/snapshot` 改为初始化/诊断用途。
- **数据:** `workflow_yjs_snapshots` 和 `workflow_yjs_updates` 成为协作图状态的主持久化；`workflows.nodes/edges` 只作为运行、列表、非协作读模型的投影。

## 核心场景

### 需求: 多 client 同画布实时一致
**模块:** workflow-canvas collaboration

#### 场景: A 移动节点，B/C 同步显示
- A 直接提交 Yjs `nodeFrames` 更新。
- 服务端接收并持久化 update 后广播给 B/C，不回声广播给 A。
- B/C 从 ydoc observe 派生 React Flow nodes，不经过 REST full snapshot 覆盖。

#### 场景: A 保存或自动持久化后节点不复原
- 保存不再触发 `importWorkflowSnapshotToYjs`。
- 服务端 ack 只更新保存状态，不修改客户端 ydoc。
- A 的本地 ydoc 不会被服务端 plain snapshot 清空重建。

#### 场景: B 更新后 A 不出现空画布
- 远端 update 只应用到 ydoc；投影层导出前校验 `nodeOrder`/`nodes` 一致性。
- 不再使用 `applyRemoteSnapshot(source: 'yjs')` 整包替换 dirty store。

### 需求: 并发编辑可解释
**模块:** Yjs document model

#### 场景: 同节点不同字段并发编辑
- 节点 frame、metadata、task config、media slots 拆分到更细粒度 Yjs 类型。
- 位置类字段采用 last-write-wins；文本类字段优先使用 `Y.Text` 或明确 last-write-wins 策略。

#### 场景: 离线/重连后合并
- client 与 server 通过 Yjs state vector 同步缺失 update。
- 服务端房间重建时从 binary snapshot + update log 恢复。
- 不允许 client 将 plain empty snapshot 回写为权威状态。

## 风险评估
- **风险:** 重构影响面大，涉及前端交互、服务端同步协议、持久化和运行前 snapshot。
  **缓解:** 按阶段启用新 Yjs SSOT 管线，先在 primary sync mode 下替换，再删除旧 shadow/save 路径；每阶段有多 client 集成测试。
- **风险:** Yjs 文档结构细化后迁移旧 snapshot 复杂。
  **缓解:** 编写一次性兼容导入器，从旧 plain workflow definition 或旧 Yjs map 结构导入新结构，导入只允许在 server cold load/迁移时发生。
- **风险:** `workflows.nodes/edges` 仍被运行模块消费，可能与 Yjs 主状态不同步。
  **缓解:** 服务端按 update/compaction 同步维护 read model；运行前强制从 server ydoc 导出最新 snapshot。
