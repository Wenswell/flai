# Workflow

Default mode: tiny. Escalate only when risk or uncertainty justifies it.

## Start

- Confirm the task goal in one sentence.
- Read `<workflow-state>` first.
- If workflow status is `STALE_POINTER`, run the next command before other work.
- If workflow status is `NOT_READY`, handle or explicitly acknowledge the missing context before implementation.
- Before file edits, state the edit scope.
- Use injected source map first, then read source files on demand.
- Trust current files over memory.
- Use `.flai/conversation.md` as the active discussion state before creating task files.

## Conversation-first Rule

Update `.flai/conversation.md` when any of these change:

- current goal
- conclusion
- plan
- open question
- decision
- issue candidate

Update it before ending the turn. Keep it short. Do not copy chat transcripts.

When an issue candidate becomes actionable, add it to `.flai/issues.md`.

## tiny

Use for clear, low-risk work touching one or two files.

- Do not create task docs.
- Implement directly.
- Run the smallest useful verification.
- Update `.flai/conversation.md` only when the discussion state changed.

## normal

Use for bounded work touching several files, or work that needs continuity.

- A task directory is allowed.
- Keep the plan short.
- Keep `.flai/conversation.md` current until work moves into a task directory.
- Update `status.md` after meaningful progress.
- Verification should cover the changed path.

Suggested task files:

- `status.md`: current state, next step, blockers, latest verification, key files
- `plan.md`: implementation plan, read only when useful
- `log.md`: process facts, not read by default
- `summary.md`: final compressed outcome

## deep

Only for vague, architectural, migration, security, permission, public API, or repeatedly failing work.

- Clarify goals and constraints first.
- Record risks, rollback points, and verification.
- Keep decisions in `plan.md`.
- Write `summary.md` when finished.

## status.md Rule

Keep `status.md` short. Use this structure:

- `State`
- `Next`
- `Blockers`
- `Verification`
- `Key files`

Put process history in `log.md`.

## Workflow State

The context hook injects `<workflow-state>` on every session.

- `READY`: current phase has enough context to continue.
- `NOT_READY`: required context is missing.
- `NO_TASK`: the current phase needs a task, but no task is active.
- `STALE_POINTER`: `.flai/.current-task` points to a missing file.

Follow the `Next command` unless the user explicitly changes direction.
