# Startup Phase

- 先读取 `<workflow-state>`。
- 如果状态是 `STALE_POINTER`，先执行下一条命令再继续。
- 如果状态是 `NOT_READY`，先补齐或明确说明缺失上下文，再进入实现。
- 用一句话说明已理解的任务目标。
- 在规划或改文件前判断任务复杂度：tiny、normal、deep。
- 如果没有当前任务，除非用户要求更大任务，否则保持 tiny。
- 如果 goal、conclusions、open questions 或 next step 发生变化，本轮结束前更新 `.flai/conversation.md`。
- 保持 `.flai/conversation.md` 压缩，不复制聊天全文。
- 优先相信当前文件，而不是记忆。
- 除非必要，不读取 git 历史、dist、build 产物或锁文件。
- 使用有范围的路径或模式搜索，避免宽泛全仓搜索。
