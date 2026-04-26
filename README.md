# flai

Lightweight `.flai` context initializer for Codex and Claude Code.

## Install

After publishing:

```bash
npm install -g @wenswell/flai
```

## Use

```bash
flai init [path] [-f]
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

Typical setup:

```bash
flai user
flai init .
```

`flai init` creates project `.flai` docs plus Codex and Claude Code hook adapters. Runtime code stays in the installed npm package.

`flai context` prints rendered context for the current project. Modes are `startup`, `brainstorm`, `implement`, `review`, `debug`, and `task`. Use `--budget` to change the character budget. Use `--sources` to print a compact `console.table` source view with chars, tokens, state, and a 20-character preview.

`flai task` creates and selects lightweight task directories under `.flai/tasks/`.

`flai phase` records the current workflow phase in `.flai/.phase`. When `flai context` is run without an explicit mode, it uses the current phase. `flai task start` sets the phase to `implement`; `flai task finish` resets it to `startup`.

`flai update-user` updates user defaults from the installed package templates. It only overwrites files still matching the previous managed template. Locally edited files are reported as conflicts unless `-f` is used.

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
