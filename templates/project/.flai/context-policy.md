# Context Policy

## Startup Context

Session hooks inject a compact context built from:

- user-level `.flai` defaults when available
- `.flai/now.md`
- active task `status.md`
- `.flai/project.md`
- `.flai/context-policy.md`
- project `.flai` document index

If hook context is missing, read:

1. `.flai/now.md`
2. `.flai/project.md`
3. `.flai/context-policy.md`
4. the active task `status.md` referenced by `now.md`

## Task Modes

`tiny`: clear, low-risk work touching one or two files. No task docs. Minimal verification.

`normal`: bounded work needing several files or a short plan. Use task `status.md` when continuity matters.

`deep`: vague, high-risk, cross-layer, architectural, migration, security, permission, public API, or repeatedly failing work.

## Documents

- `status.md`: current state, next step, blockers
- `plan.md`: implementation plan for normal/deep tasks
- `log.md`: useful process facts only, not chat transcript
- `summary.md`: final compressed result

Do not read task `log.md` by default.
