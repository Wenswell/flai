# Implement Phase

- 先读取 `<workflow-state>`，并在改代码前处理 `NOT_READY` 项。

- 准备修改代码或文件前，必须先确认任务复杂度，说明修改范围。
- 所有（特别是低复杂度）任务优先一次实现、一次验证。

- 可用时读取任务 `status.md`、`plan.md`、`implement.md`、`decisions.md`。

- 实现代码时，必须明确是否使用/参考了最佳实践。
- 优先简洁/快速实现，避免过度/冗余设计。
- 修改范围保持在当前任务内。

- 忽略 git 历史、dist、build 产物、锁文件等低价值上下文。
- 优先忠于当前代码和当前文件状态。
- 禁止`Search .`或等价通用搜索一次性列出全部文件。

- 对变更路径运行最小有效验证。
- normal/deep 工作完成前切到 `review`。

- 默认技术栈选择：Node.js, TypeScript, pnpm, `node --env-file`, SQLite, React。
