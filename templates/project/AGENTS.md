# Context

优先使用已注入的 `.flai` 上下文。

如果缺少注入上下文，读取 `.flai/context-policy.md`，并按其中的 startup 兜底列表继续。

开发、审核或调试前，必须使用当前阶段上下文：

```bash
flai context implement
flai context review
flai context debug
```

按输出里的 `<workflow-gate>` 和 `<phase-policy>` 执行。遇到 `STALE_POINTER`、`NO_TASK`、`NOT_READY` 时，先按 `Next command` 处理，除非用户明确要求跳过。
