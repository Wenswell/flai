# Context Policy

## Startup Context

Session hook 会注入压缩后的上下文，来源包括：

- `<workflow-state>`：active phase、任务状态、缺失项、下一条命令
- 当前 `.flai/policy/<phase>.md`
- 可用时读取用户级 `.flai` 默认设置
- `.flai/now.md`
- startup/brainstorm 阶段读取 `.flai/conversation.md`
- 按阶段读取项目文档，例如 `.flai/issues.md`
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

## Workflow State

AI 必须先读取 `<workflow-state>`：

- `READY`：active phase 具备继续条件。
- `NOT_READY`：缺少当前阶段必要上下文。
- `NO_TASK`：active phase 需要任务，但没有当前任务。
- `STALE_POINTER`：当前任务指向不存在的文件。

任何任务不论大小，AI 在执行命令、修改代码、写文件、删文件或提交前，必须先说明执行范围，并等待用户明确确认。

只读查看上下文可以先做。

当状态不是 `READY` 时，先回应 `Next command`；如果要实际执行命令，仍需等待用户确认。
