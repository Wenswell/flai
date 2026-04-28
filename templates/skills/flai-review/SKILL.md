---
name: flai-review
description: Perform focused code and project review for bugs, regressions, missing validation, missed requirements, release readiness, and high-value simplification opportunities. Use when Codex is asked to review code, review a task before completion, audit recent changes, check whether work can ship, or strengthen a review/debug phase with evidence-based findings and next actions.
---

# flai:review

## 核心规则

- 优先遵守当前项目指令。
- 如果项目有 workflow gate，review 前先读取当前阶段上下文。
- 读取上下文无需确认；此外任何大小任务，在执行命令、增删改文件或提交前，必须先说明执行范围，并等待用户明确确认。

## 审查范围

- 从用户指定范围开始。
- 范围不明确时，从当前任务、已改文件或用户提到的文件推断最小有效范围。
- 可用时读取任务 `review.md`。
- 仅在调试或恢复失败路径时读取 `log.md`。
- 按范围读取源码，避免宽泛全仓搜索。
- 非必要默认不读取 git 历史、dist、build 产物或锁文件。

## 审查重点

- 审核 bug、回归、缺失验证和遗漏需求。
- 优先识别Bugs, crashes, data loss, security issues, broken contracts。
- 检查行为是否偏离需求，是否引入用户可见回归。
- 检查验证是否覆盖本次变更的核心行为。
- 检查本次相关文件是否有必要、可精简、可合并、可删除。
- 清理明显多余或明确不需要的文件。
- 及时指出明显偏大的文件和可拆分逻辑。

## 验证规则

- 默认只做 `check`、`build` 或最小必要验证，禁止主动扩展测试范围。
- 说明失败现象、证据和当前假设。
- 优先推进一个经过验证的修复路径，不做多个猜测性改动。
- 只有经验可复用时才更新 `failure-patterns.md`。

## 输出要求

- review 输出先列问题。
- 每个问题说明失败模式、证据、影响和文件位置。
- 没有问题时，直接说明没有发现阻断项，并说明剩余验证缺口或残余风险。
- 审查代码时，必须明确是否使用/参考了最佳实践。
- 审查后，总体回顾，必须明确是否有 模块/部分/逻辑 需要/可以/应该 继续优化/简化。
- 审查后，跳出当前任务，必须再次明确是否有 模块/部分/逻辑 需要/可以/应该 继续优化/简化。
- 审查后，再次整体回顾，必须明确项目继续优化的方向，当前是否可上线，是否还有高价值的优化项未被提及。

## 收尾规则

- 未解决风险记录到任务 `status.md`。
- review 问题未解决时，不结束 normal/deep 工作。
- 如果发生代码或文件修改，结束前说明本次修改的 commit message。
- 如果当前目录是 git 项目，并且本地 workflow 要求提交，则只提交本次变动范围内的文件。
