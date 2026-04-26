# 上下文策略

## 启动上下文

会话 hook 会注入压缩后的上下文，来源包括：

- 可用时读取用户级 `.flai` 默认设置
- `.flai/now.md`
- 当前任务的 `status.md`
- `.flai/project.md`
- `.flai/context-policy.md`
- 项目 `.flai` 文档索引

如果 hook 上下文缺失，按顺序读取：

1. `.flai/now.md`
2. `.flai/project.md`
3. `.flai/context-policy.md`
4. `now.md` 指向的当前任务 `status.md`

## 任务模式

`tiny`：明确、低风险、只涉及一两个文件的任务。不创建任务文档。只做最小验证。

`normal`：范围明确但涉及多个文件，或需要简短计划的任务。需要连续上下文时使用任务 `status.md`。

`deep`：需求模糊、高风险、跨层、架构、迁移、安全、权限、公共 API、反复失败的任务。

## 文档

- `status.md`：当前状态、下一步、阻塞项
- `plan.md`：normal/deep 任务的实现计划
- `log.md`：有用的过程事实，不记录聊天全文
- `summary.md`：最终压缩结果

默认不读取任务 `log.md`。

## 实现规则

- 涉及 LLM、第三方接口等外部 API 调用的逻辑，必须在每次调用后及时保存进度。
- 出错重试时必须能从已保存进度继续，防止从头重跑。

- 项目中的必须保存（关键步骤、用户交互、外部接口等）日志，并在终端打印开始、进度、结束。
- 默认使用`pino-pretty`；默认保存 JSONL 日志；终端日志需要简单美化，只在必要时打印JSON。
