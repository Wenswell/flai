# 上下文策略

## 启动上下文

会话 hook 会注入压缩后的上下文，来源包括：

- `<workflow-state>`：当前阶段、任务状态、缺失项、下一条命令
- 当前阶段对应的 `.flai/policy/<phase>.md`
- 可用时读取用户级 `.flai` 默认设置
- `.flai/now.md`
- `.flai/conversation.md`
- `.flai/issues.md`
- 当前任务的 `status.md`
- 项目 `.flai` 文档索引

如果 hook 上下文缺失，按顺序读取：

1. `.flai/now.md`
2. `.flai/policy/startup.md`
3. `.flai/conversation.md`
4. `.flai/issues.md`
5. `.flai/project.md`
6. `.flai/context-policy.md`
7. `now.md` 指向的当前任务 `status.md`

## 工作流状态

AI 必须先读取 `<workflow-state>`：

- `READY`：当前阶段具备继续条件。
- `NOT_READY`：缺少当前阶段必要上下文。
- `NO_TASK`：当前阶段需要任务，但没有当前任务。
- `STALE_POINTER`：当前任务指向不存在的文件。

当状态不是 `READY` 时，优先执行或回应 `Next command`。
