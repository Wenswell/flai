# flai

Lightweight `.flai` context initializer for Codex and Claude Code.

## Install

After publishing:

```bash
npm install -g @wenswell/flai
```

## Use

```bash
flai init [path] [-u]
flai init [path] -v
flai context [mode] [--budget <chars>]
flai context [mode] --sources
flai task create "title"
flai task start <name>
flai task list
flai task current
flai task finish
flai phase current
flai phase set <mode>
flai phase check
flai user [path] [-f]
flai update-user [path] [-f]
flai self-update [path] [-f]
flai uninstall-user [path] -f
flai help
```

The same commands grouped by daily use:

```text
Setup:
  flai init [path]              Set up flai in a project
  flai init [path] -u           Update hooks and skills interactively
  flai init [path] -v           Show changed file paths
  flai user [path]              Set up user preferences

Daily commands:
  flai context [mode]           Print current AI context
  flai task create "title"      Create a task
  flai task start <name>        Start a task
  flai task finish              Finish current task

Project state:
  flai task list                List tasks
  flai task current             Show current task
  flai phase current            Show current phase
  flai phase set <mode>         Set phase
  flai phase check              Check current workflow state
```

Typical setup:

```bash
flai user
flai init .
```

`flai init` creates missing project `.flai` docs plus Codex and Claude Code hook adapters. Existing files are kept. It also scans install files and reports whether hooks, settings, and skills differ from the installed templates. Add `-v` to show file paths. `flai init -u` opens an interactive `console.table` picker to apply selected install file updates. Runtime code stays in the installed npm package.

`flai context` prints rendered context for the current project. Modes are `startup`, `brainstorm`, `implement`, `review`, and `debug`. Use `--budget` to change the character budget. Use `--sources` to print one compact `console.table` with budgeted source, type/mode, chars, tokens, fit, reason, and a 20-character preview.

`flai task` creates and selects lightweight task directories under `.flai/tasks/`.

`flai phase` records the current workflow phase in `.flai/.phase`. When `flai context` is run without an explicit mode, it uses the current phase. `flai task start` sets the phase to `implement`; `flai task finish` resets it to `startup`.

Phase-specific defaults live in `.flai/policy/<phase>.md`; `workflow.md` is no longer generated.
`.flai/conversation.md` is injected only for `startup` and `brainstorm`; task work should move state into task files.

Every rendered context includes `<workflow-state>` with one active phase.

| status | meaning | next step |
|---|---|---|
| `READY` | Active phase has enough context. | Continue with `flai context <phase>`. |
| `NOT_READY` | Required phase context is missing. | Fill the missing task file or acknowledge the gap. |
| `NO_TASK` | The active phase needs a task. | Create a task for `implement`, or run `flai task list` for `review`/`debug`. |
| `STALE_POINTER` | `.flai/.current-task` points to a missing file. | Run `flai task finish`. |

`flai update-user` updates user defaults from the installed package templates. It overwrites or removes only files still matching a previous managed template. Locally edited files are reported as conflicts unless `-f` is used.

Update the installed package first, then update user defaults:

```bash
npm update -g @wenswell/flai
flai update-user
```

Or run both steps:

```bash
flai self-update
```

## Local Test Before Publishing

```bash
npm install -g .
flai help
flai init ./some-repo
```

## Publish

Create a GitHub repository and push this project:

```bash
git remote add origin https://github.com/<user-or-org>/flai.git
git branch -M main
git push -u origin main
```

Add an npm automation token to GitHub:

```text
GitHub repo Settings -> Secrets and variables -> Actions -> New repository secret
Name: NPM_TOKEN
Value: npm automation token
```

Then publish by creating a GitHub Release for the current package version.

```bash
pnpm test
npm pack --dry-run
npm login
npm publish --access public
```

Local manual publish still works, but normal updates should go through GitHub Releases so CI and package checks run first.
