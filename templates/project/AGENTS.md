# Context

SessionStart should inject `.flai` context automatically.

If hook context is missing, read:

1. `.flai/now.md`
2. `.flai/project.md`
3. `.flai/context-policy.md`
4. the active task `status.md` referenced by `.flai/now.md`

Default to `tiny` or `normal` flow. Use `deep` only when escalation conditions match.

Do not read task `log.md` by default. Do not create task docs, PRDs, multi-agent plans, or review loops for tiny work.
