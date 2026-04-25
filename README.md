# flai

Lightweight `.flai` context initializer for Codex and Claude Code.

## Install

After publishing:

```bash
npm install -g flai
```

If the package name `flai` is already taken on npm, publish it as a scoped package such as `@your-scope/flai`. The command can still be `flai` because the binary name is controlled by `package.json`.

```bash
npm install -g @your-scope/flai
```

## Use

```bash
flai init [path] [-f]
flai user [path] [-f]
flai uninstall-user [path] -f
flai context [path] [--max <chars>]
flai help
```

Typical setup:

```bash
flai user
flai init .
```

`flai init` creates project `.flai` docs plus Codex and Claude Code hook adapters. Runtime code stays in the installed npm package.

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
