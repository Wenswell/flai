import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { initProject, initUser, runCli, uninstallUser } from "../src/cli.mjs";

async function tempRoot(name) {
  return mkdtemp(path.join(tmpdir(), `ai-admin-${name}-`));
}

test("initUser creates user-level preference and workflow files without overwriting", async () => {
  const root = await tempRoot("user");
  const userFlaiDir = path.join(root, ".flai");

  await mkdir(userFlaiDir, { recursive: true });
  await writeFile(path.join(userFlaiDir, "preferences.md"), "# Custom\n\nKeep this.\n", "utf8");

  const result = await initUser({ userFlaiDir });

  assert.equal(result.created.includes(path.join(userFlaiDir, "workflow.md")), true);
  assert.equal(result.skipped.includes(path.join(userFlaiDir, "preferences.md")), true);
  assert.equal(await readFile(path.join(userFlaiDir, "preferences.md"), "utf8"), "# Custom\n\nKeep this.\n");
  assert.equal(existsSync(path.join(userFlaiDir, "context-policy.md")), true);
  assert.equal(existsSync(path.join(userFlaiDir, "failure-patterns.md")), true);
  assert.equal(existsSync(path.join(userFlaiDir, "memories.md")), true);
});

test("uninstallUser requires explicit confirmation and removes only the user directory", async () => {
  const root = await tempRoot("uninstall");
  const userFlaiDir = path.join(root, ".flai");
  const keepFile = path.join(root, "keep.txt");

  await mkdir(userFlaiDir, { recursive: true });
  await writeFile(path.join(userFlaiDir, "preferences.md"), "# Preferences\n", "utf8");
  await writeFile(keepFile, "keep", "utf8");

  await assert.rejects(() => uninstallUser({ userFlaiDir }), /-f/);
  assert.equal(existsSync(userFlaiDir), true);

  const result = await uninstallUser({ userFlaiDir, confirm: true });

  assert.equal(result.removed, userFlaiDir);
  assert.equal(existsSync(userFlaiDir), false);
  assert.equal(existsSync(keepFile), true);
});

test("initProject creates project docs, hooks, and fallback instructions", async () => {
  const repoDir = await tempRoot("project");

  const result = await initProject({ repoDir });
  const codexHook = await readFile(path.join(repoDir, ".codex", "hooks", "session-start.mjs"), "utf8");
  const claudeHook = await readFile(path.join(repoDir, ".claude", "hooks", "session-start.mjs"), "utf8");

  assert.equal(existsSync(path.join(repoDir, ".flai", "project.md")), true);
  assert.equal(existsSync(path.join(repoDir, ".flai", "now.md")), true);
  assert.equal(existsSync(path.join(repoDir, ".flai", "context-policy.md")), true);
  assert.equal(existsSync(path.join(repoDir, ".codex", "hooks.json")), true);
  assert.equal(existsSync(path.join(repoDir, ".codex", "hooks", "session-start.mjs")), true);
  assert.equal(existsSync(path.join(repoDir, ".claude", "settings.json")), true);
  assert.equal(existsSync(path.join(repoDir, ".claude", "hooks", "session-start.mjs")), true);
  assert.equal(existsSync(path.join(repoDir, "AGENTS.md")), true);
  assert.equal(existsSync(path.join(repoDir, "CLAUDE.md")), true);
  assert.match(codexHook, /file:\/\/\//);
  assert.match(claudeHook, /file:\/\/\//);
  assert.doesNotMatch(codexHook, /\.flai\/scripts|\.flai\\scripts/);
  assert.doesNotMatch(claudeHook, /\.flai\/scripts|\.flai\\scripts/);
  assert.equal(result.created.length > 8, true);
});

test("initProject preserves existing files unless force is enabled", async () => {
  const repoDir = await tempRoot("preserve");
  const agentsPath = path.join(repoDir, "AGENTS.md");

  await writeFile(agentsPath, "# Existing\n", "utf8");

  const first = await initProject({ repoDir });
  assert.equal(first.skipped.includes(agentsPath), true);
  assert.equal(await readFile(agentsPath, "utf8"), "# Existing\n");

  const second = await initProject({ repoDir, force: true });
  assert.equal(second.created.includes(agentsPath), true);
  assert.match(await readFile(agentsPath, "utf8"), /SessionStart/);
});

function createWritable() {
  let output = "";
  return {
    stream: {
      write(value) {
        output += value;
      },
    },
    get output() {
      return output;
    },
  };
}

test("runCli supports concise pnpm-style project init command", async () => {
  const repoDir = await tempRoot("cli-init");
  const stdout = createWritable();
  const stderr = createWritable();

  await runCli({
    argv: ["node", "flai", "init", repoDir],
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.match(stdout.output, /Initialized project \.flai data/);
  assert.equal(stderr.output, "");
  assert.equal(existsSync(path.join(repoDir, ".flai", "project.md")), true);
});

test("runCli supports concise user init and uninstall commands", async () => {
  const root = await tempRoot("cli-user");
  const userDir = path.join(root, ".flai");
  const stdout = createWritable();

  await runCli({
    argv: ["node", "flai", "user", userDir],
    stdout: stdout.stream,
    stderr: createWritable().stream,
  });

  assert.match(stdout.output, /Initialized user \.flai data/);
  assert.equal(existsSync(path.join(userDir, "preferences.md")), true);

  await runCli({
    argv: ["node", "flai", "uninstall-user", userDir, "-f"],
    stdout: createWritable().stream,
    stderr: createWritable().stream,
  });

  assert.equal(existsSync(userDir), false);
});

test("runCli prints help for help command", async () => {
  const stdout = createWritable();

  await runCli({
    argv: ["node", "flai", "help"],
    stdout: stdout.stream,
    stderr: createWritable().stream,
  });

  assert.match(stdout.output, /pnpm flai init/);
  assert.match(stdout.output, /Initialize a project/);
  assert.match(stdout.output, /Initialize user-level defaults/);
  assert.match(stdout.output, /Print startup context/);
});
