# 技术设计: Workflow Canvas 性能策略与公共资源权限加固

## 方案
- 新增 `flow-performance-policy`，按节点、边、媒体节点加权决定 React Flow `onlyRenderVisibleElements`，避免只按节点数量判断。
- 新增 `useCurrentNodeVisible`，通过 React Flow store 计算当前节点是否在视口或视口边缘附近；媒体节点只在可见/近可见时启用 task detail query。
- 将 Yjs node frame commit 从全量 clone/export/schema validation 改为增量校验后直接写 live ydoc；校验范围覆盖节点存在、有限位置、正数尺寸、非空 parent id。结构性图变更继续使用完整 dry-run graph validation。
- 缓存 Yjs runtime snapshot signature，并在同步投影比较时优先使用缓存，减少重复序列化。
- 移除 workflow canvas 活动画布上的 `backdrop-filter`、SVG `drop-shadow`、keyframe flow/pulse、transition transform scale 等高成本样式，保留现有 token、边框、阴影语义。
- 将 registry helper 从源头模块直接导入，仅保留 `import './registry'` 作为显式初始化副作用。
- 合同层新增 `public_library` media purpose，API direct/presigned upload 在该 purpose 下调用 `assertCanManagePublicResource`。

## 边界
- 不实现普通用户“申请分享到公共资源”的业务流。
- 不改变 workflow canvas 的布局、色彩体系和交互模型。
- 不把 Yjs 对象值进一步拆成 nested CRDT 字段；本次只处理已存在 frame 热路径。
