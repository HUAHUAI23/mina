# 变更提案: 工作流画布性能与协作同步重构

## 需求背景
Mina 的工作流画布在重构后出现交互卡顿，主要表现为节点拖拽/画布移动在数据变动后明显变慢。已验证过移除部分 UI、预览、工具栏等局部因素不能稳定解决问题；把拖拽过程中的位置同步回状态后交互会变顺，但保存、WebSocket 事件和自动同步又失效。

这说明问题不是单个组件太重，而是高频交互状态、业务持久状态、自动保存、WebSocket 同步和节点渲染共享同一条更新链路。React Flow 官方性能文档也明确指出，节点移动会触发高频状态更新，不必要的重渲染是 React Flow 性能问题的常见来源。

## 变更内容
1. 将 React Flow 高频渲染状态与 Mina 业务持久状态拆分，避免拖拽每帧触发保存、WS、全量节点投影和重渲染。
2. 保持受控 React Flow 的正确语义：`onNodesChange` 必须把 `NodeChange[]` 应用到渲染节点状态。
3. 拖拽开始记录基线，拖拽中只更新渲染状态和可选 presence，拖拽结束只提交一次持久化变更。
4. 重构节点渲染订阅，节点组件避免直接依赖频繁变化的全量 `nodes`/`edges`。
5. 保留图片静态资源体验；视频节点默认只展示 poster/封面，不在画布节点内挂载 `<video>`。
6. 增加 React Flow + Yjs + y-websocket 协作方案，支持实时协作、presence、冲突合并和后续离线/恢复能力。
7. 增加性能基线、回归指标和阶段化上线策略。

## 影响范围
- **模块:** `apps/web/src/features/workflow-canvas`
- **文件:** React Flow 适配层、canvas store、autosave hook、WS 事件处理、节点组件、媒体预览组件、后端工作流事件/保存接口
- **API:** 现阶段可保持 REST 保存 API；协作阶段新增 Yjs WebSocket room 和文档持久化接口
- **数据:** 当前 workflow canvas JSON 继续兼容；协作阶段新增 Yjs update/snapshot 存储或从 Yjs 文档导出 canvas snapshot

## 核心场景

### 需求: 拖拽与画布移动保持流畅
**模块:** workflow-canvas
用户拖拽节点、平移视口或缩放画布时，交互不能被保存、WS、节点数据同步拖慢。

#### 场景: 节点拖拽
拖拽期间 React Flow 渲染位置应即时更新。
- 拖拽中不触发 autosave。
- 拖拽中不触发业务持久状态全量重建。
- 拖拽结束如果位置变化，只提交一次 dirty revision。

#### 场景: 画布平移/缩放
视口变化属于高频 UI 状态。
- 平移/缩放不触发 workflow dirty。
- 如果需要记住 viewport，只在 `onMoveEnd` 或节流后保存本地 UI 状态。

### 需求: 保存与 WS 同步不丢失
**模块:** workflow-canvas
拖拽变顺后，保存和远端通知仍必须工作。

#### 场景: 拖拽结束自动保存
拖拽停止后最终位置应进入持久状态。
- `draftRevision` 增加一次。
- autosave 触发一次。
- 保存成功后 `savedRevision` 正确推进。

#### 场景: 远端变更通知
WebSocket 不应因本地 dirty、selection、version 等高频状态变化反复重连。
- socket 生命周期只跟 workflowId/URL 等连接参数有关。
- 最新状态通过 ref 或 store snapshot 读取。

### 需求: 节点媒体体验不降级
**模块:** workflow-canvas nodes
优化性能不能通过牺牲核心画布可读性实现。

#### 场景: 图片节点
图片预览仍在画布节点内显示。
- 图片使用稳定尺寸、异步解码和缓存。
- 拖拽时不临时隐藏图片。

#### 场景: 视频节点
视频节点默认展示封面。
- 画布节点内不挂载可播放 `<video>`。
- 用户打开详情/媒体查看器时再加载视频。

### 需求: 支持协作方案
**模块:** workflow-canvas sync
方案必须包含 React Flow + Yjs + y-websocket 方向。

#### 场景: 多用户同时编辑
多用户编辑同一个 workflow 时，节点、边、配置、位置可以同步。
- 持久文档状态通过 Yjs CRDT 合并。
- 光标、选区、正在拖拽的位置通过 awareness/presence 同步。
- 连接断开和重连后能恢复一致状态。

## 风险评估
- **风险:** 继续把拖拽每帧写入业务 store，会让 autosave、WS、节点投影和节点组件订阅一起参与高频更新。
  **缓解:** 拆分 render state、document state、presence state，并定义明确提交边界。
- **风险:** 只在拖拽结束写位置会破坏受控 React Flow 的更新语义，造成内部状态与外部 `nodes` prop 冲突。
  **缓解:** 渲染层始终应用 `NodeChange[]`，持久层只在语义完成时提交。
- **风险:** 直接引入 Yjs 会改变数据源和冲突模型。
  **缓解:** 分阶段引入，先保留 REST snapshot 保存，再增加 Yjs shadow sync，最后切换协作主链路。
- **风险:** 大画布开启 `onlyRenderVisibleElements` 可能增加额外计算开销。
  **缓解:** 按节点数量阈值和真实性能数据决定是否启用。
