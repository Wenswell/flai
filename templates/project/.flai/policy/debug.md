# Debug Phase

- State the failure, evidence, and current hypothesis.
- Read `log.md` only when debugging or resuming a failed path.
- Use scoped source reads. Avoid broad full-repo searches.
- Do not read git history, dist, build output, or lockfiles unless they are part of the failure.
- Prefer one tested fix over multiple speculative changes.
- Update `failure-patterns.md` only when the lesson is reusable.
