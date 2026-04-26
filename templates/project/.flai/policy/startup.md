# Startup Phase

- Read `<workflow-state>` first.
- If status is `STALE_POINTER`, run the next command before continuing.
- If status is `NOT_READY`, fill or acknowledge the missing context before implementation.
- State the understood task goal in one sentence.
- Decide task complexity before planning or editing: tiny, normal, or deep.
- If no task is active, keep work tiny unless the user asks for a larger task.
- Prefer current files over memory.
- Search with scoped paths or patterns. Avoid broad full-repo searches.
- Do not read git history, dist, build output, or lockfiles unless needed.
