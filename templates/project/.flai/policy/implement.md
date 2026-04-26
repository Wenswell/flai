# Implement Phase

- Read `<workflow-state>` and resolve `NOT_READY` items before editing code.
- State the edit scope before changing files.
- Use task `status.md`, `plan.md`, `implement.md`, and `decisions.md` when present.
- Keep edits scoped to the current task.
- Prefer simple implementation and avoid over-design unless the user asks for more.
- Use scoped source reads. Avoid broad full-repo searches.
- Do not read git history, dist, build output, or lockfiles unless needed.
- Run the smallest useful verification for the changed path.
- For tiny tasks, implement once and verify once.
- Move to `review` before finishing normal/deep work.
