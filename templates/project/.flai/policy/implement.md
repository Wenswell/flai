# Implement Phase

- 先读取 `<workflow-state>`，并在改代码前处理 `NOT_READY` 项。
- 改文件前说明修改范围。
- 可用时读取任务 `status.md`、`plan.md`、`implement.md`、`decisions.md`。
- 修改范围保持在当前任务内。
- 优先简单实现，除非用户要求更多设计，否则避免过度设计。
- 按范围读取源码，避免宽泛全仓搜索。
- 除非必要，不读取 git 历史、dist、build 产物或锁文件。
- 对变更路径运行最小有效验证。
- tiny 任务一次实现、一次验证。
- normal/deep 工作完成前切到 `review`。
