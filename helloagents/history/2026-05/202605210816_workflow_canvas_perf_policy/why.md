# 需求说明: Workflow Canvas 性能策略与公共资源权限加固

## 背景
- Workflow canvas 已经完成 Yjs 单一事实源与 render/document split，但中大型媒体画布仍有可优化的热路径：React Flow 可见元素渲染开关、媒体节点任务查询、Yjs frame commit、CSS 滤镜/动画效果。
- 用户要求保持现有 UI 风格，不引入高 GPU 成本效果，并确保公共资源上传/编辑只允许管理员。

## 目标
- 用简单、可测试的策略降低媒体画布渲染和网络查询压力。
- 保留结构性图变更的完整校验，同时减少拖拽 frame commit 的 O(N) 热路径成本。
- 清理 workflow canvas 中影响 GPU/合成性能的 CSS 效果，不做视觉重设计。
- 明确 `public_library` 媒体上传只能由管理员执行；用户申请分享为公共资源的流程暂不实现。
