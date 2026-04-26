# Context Policy

## Startup Context

The session hook injects compact context from:

- `<workflow-state>`: active phase, task state, missing items, and next command
- the current `.flai/policy/<phase>.md`
- user-level `.flai` defaults when available
- `.flai/now.md`
- `.flai/conversation.md`
- `.flai/issues.md`
- current task `status.md`
- project `.flai` document index

If hook context is missing, read these in order:

1. `.flai/now.md`
2. `.flai/policy/startup.md`
3. `.flai/conversation.md`
4. `.flai/issues.md`
5. `.flai/project.md`
6. `.flai/context-policy.md`
7. current task `status.md` referenced by `now.md`

## Workflow State

AI must read `<workflow-state>` first:

- `READY`: active phase has enough context to continue.
- `NOT_READY`: required phase context is missing.
- `NO_TASK`: active phase needs a task, but no task is active.
- `STALE_POINTER`: current task points to a missing file.

When status is not `READY`, prioritize `Next command`.
