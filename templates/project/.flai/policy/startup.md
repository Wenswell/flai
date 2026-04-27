# Startup Phase

- 首先读取 `<workflow-state>`。
- 任何任务不论大小，在执行命令、修改代码、写文件、删文件或提交前，必须先说明执行范围，并等待用户明确确认。
- 只读查看上下文可以先做。
- 若状态是 `STALE_POINTER`，则说明下一条命令，得到确认后再执行。
- 若状态是 `NOT_READY`，则补齐或明确说明缺失上下文，再进入实现。
- 收到指令后，必须先用一句话说明对收到指令的任务目标的理解。
- 在规划或改文件前判断任务复杂度：tiny、normal、deep。
- 若没有当前任务，保持 tiny，直到用户要求大型任务。
- 本轮结束前判断更新 `.flai/conversation.md`，尤其当 goal、conclusions、open questions 或 next step 发生变化时。
- 保持 `.flai/conversation.md` 简洁，只保留高信息量内容。
- 除非必要，禁止查看 git 历史、dist、build 产物、锁文件等低价值上下文。
- 优先忠于当前代码和当前文件状态。
- 使用有范围的路径或模式搜索，禁止`Search .`或等价通用搜索一次性列出全部文件，避免污染上下文。
