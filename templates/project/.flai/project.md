# Project

## Purpose

Describe {{PROJECT_NAME}}.

## Structure

- `.flai/`: project context and task state
- `.flai/tasks/`: one directory per normal/deep task or handled issue
- `.codex/`: Codex hook adapter
- `.claude/`: Claude Code hook adapter

## Commands

- Print context: `flai context`

## Conventions

- Default to `tiny` or `normal`.
- Use `deep` only when escalation conditions match.
- Do not read task `log.md` by default.
