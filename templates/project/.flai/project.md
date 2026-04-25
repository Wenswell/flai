# 项目

## 目的

描述 {{PROJECT_NAME}}。

## 结构

- `.flai/`：项目上下文和任务状态
- `.flai/tasks/`：每个 normal/deep 任务或已处理 issue 一个目录
- `.codex/`：Codex hook 适配
- `.claude/`：Claude Code hook 适配

## 命令

- 打印上下文：`flai context`

## 约定

- 默认使用 `tiny` 或 `normal`。
- 只有满足升级条件时才使用 `deep`。
- 默认不读取任务 `log.md`。
