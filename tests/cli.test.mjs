import { mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { promisify } from "node:util";

import { initProject, initUser, runCli, selfUpdate, uninstallUser, updateUser } from "../src/cli.mjs";

const execFileAsync = promisify(execFile);

async function tempRoot(name) {
  return mkdtemp(path.join(tmpdir(), `ai-admin-${name}-`));
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

test("initUser creates only user-level defaults without overwriting", async () => {
  const root = await tempRoot("user");
  const userFlaiDir = path.join(root, ".flai");

  await mkdir(userFlaiDir, { recursive: true });
  await writeFile(path.join(userFlaiDir, "preferences.md"), "# Custom\n\nKeep this.\n", "utf8");

  const result = await initUser({ userFlaiDir });

  assert.equal(result.skipped.includes(path.join(userFlaiDir, "preferences.md")), true);
  assert.equal(await readFile(path.join(userFlaiDir, "preferences.md"), "utf8"), "# Custom\n\nKeep this.\n");
  assert.equal(existsSync(path.join(userFlaiDir, "failure-patterns.md")), true);
  assert.equal(existsSync(path.join(userFlaiDir, "workflow.md")), false);
  assert.equal(existsSync(path.join(userFlaiDir, "context-policy.md")), false);
  assert.equal(existsSync(path.join(userFlaiDir, "memories.md")), false);
  assert.equal(existsSync(path.join(userFlaiDir, ".manifest.json")), true);
});

test("updateUser updates managed files and preserves local edits by default", async () => {
  const root = await tempRoot("user-update");
  const userFlaiDir = path.join(root, ".flai");
  const oldPreferences = "# Preferences\n\n- Old template.\n";
  const oldWorkflow = "# Workflow\n\nOld managed template.\n";
  const localFailurePatterns = "# Failure Patterns\n\nLocal edit.\n";

  await mkdir(userFlaiDir, { recursive: true });
  await writeFile(path.join(userFlaiDir, "preferences.md"), oldPreferences, "utf8");
  await writeFile(path.join(userFlaiDir, "workflow.md"), oldWorkflow, "utf8");
  await writeFile(path.join(userFlaiDir, "failure-patterns.md"), localFailurePatterns, "utf8");
  await writeFile(
    path.join(userFlaiDir, ".manifest.json"),
    `${JSON.stringify({
      files: {
        "preferences.md": { sha256: sha256(oldPreferences) },
        "workflow.md": { sha256: sha256(oldWorkflow) },
      },
    })}\n`,
    "utf8",
  );

  const result = await updateUser({ userFlaiDir });

  assert.equal(result.updated.includes(path.join(userFlaiDir, "preferences.md")), true);
  assert.equal(result.removed.includes(path.join(userFlaiDir, "workflow.md")), true);
  assert.equal(result.conflicts.includes(path.join(userFlaiDir, "failure-patterns.md")), true);
  assert.match(await readFile(path.join(userFlaiDir, "preferences.md"), "utf8"), /机器般的客观回复/);
  assert.equal(existsSync(path.join(userFlaiDir, "workflow.md")), false);
  assert.equal(await readFile(path.join(userFlaiDir, "failure-patterns.md"), "utf8"), localFailurePatterns);
});

test("selfUpdate installs the latest package and runs update-user through the flai binary", async () => {
  const root = await tempRoot("self-update");
  const userFlaiDir = path.join(root, ".flai");
  const calls = [];

  const result = await selfUpdate({
    userFlaiDir,
    force: true,
    async runCommand(command, args) {
      calls.push([command, ...args]);
    },
  });

  assert.equal(result.packageName, "@wenswell/flai");
  assert.deepEqual(calls[0].slice(1), ["install", "-g", "@wenswell/flai@latest"]);
  assert.deepEqual(calls[1], ["flai", "update-user", userFlaiDir, "-f"]);
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
  const claudePreToolHook = await readFile(path.join(repoDir, ".claude", "hooks", "pre-tool-use.mjs"), "utf8");
  const claudeSettings = await readFile(path.join(repoDir, ".claude", "settings.json"), "utf8");

  assert.equal(existsSync(path.join(repoDir, ".flai", "project.md")), true);
  assert.equal(existsSync(path.join(repoDir, ".flai", "now.md")), true);
  assert.equal(existsSync(path.join(repoDir, ".flai", "context-policy.md")), true);
  assert.equal(existsSync(path.join(repoDir, ".flai", "conversation.md")), true);
  assert.equal(existsSync(path.join(repoDir, ".flai", "issues.md")), true);
  assert.equal(existsSync(path.join(repoDir, ".flai", "workflow.md")), false);
  assert.equal(existsSync(path.join(repoDir, ".flai", "failure-patterns.md")), false);
  assert.equal(existsSync(path.join(repoDir, ".codex", "hooks.json")), true);
  assert.equal(existsSync(path.join(repoDir, ".codex", "hooks", "session-start.mjs")), true);
  assert.equal(existsSync(path.join(repoDir, ".claude", "settings.json")), true);
  assert.equal(existsSync(path.join(repoDir, ".claude", "hooks", "session-start.mjs")), true);
  assert.equal(existsSync(path.join(repoDir, ".claude", "hooks", "pre-tool-use.mjs")), true);
  assert.equal(existsSync(path.join(repoDir, "AGENTS.md")), true);
  assert.equal(existsSync(path.join(repoDir, "CLAUDE.md")), true);
  assert.match(codexHook, /file:\/\/\//);
  assert.match(claudeHook, /file:\/\/\//);
  assert.match(claudePreToolHook, /file:\/\/\//);
  assert.match(claudeSettings, /PreToolUse/);
  assert.doesNotMatch(codexHook, /\.flai\/scripts|\.flai\\scripts/);
  assert.doesNotMatch(claudeHook, /\.flai\/scripts|\.flai\\scripts/);
  assert.doesNotMatch(claudePreToolHook, /\.flai\/scripts|\.flai\\scripts/);
  assert.equal(result.created.length > 6, true);
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
  assert.match(await readFile(agentsPath, "utf8"), /\.flai\/context-policy\.md/);
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

test("runCli supports concise user init, update, and uninstall commands", async () => {
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

  const updateStdout = createWritable();
  await runCli({
    argv: ["node", "flai", "update-user", userDir],
    stdout: updateStdout.stream,
    stderr: createWritable().stream,
  });

  assert.match(updateStdout.output, /Updated user \.flai data/);

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
  assert.match(stdout.output, /pnpm flai context \[mode\]/);
  assert.match(stdout.output, /pnpm flai task list/);
  assert.match(stdout.output, /Initialize user-level defaults/);
  assert.match(stdout.output, /Update managed user defaults/);
  assert.match(stdout.output, /Update the global flai package/);
});

test("runCli context prints rendered context by default and sources table when requested", async () => {
  const repoDir = await tempRoot("cli-context");
  await mkdir(path.join(repoDir, ".flai"), { recursive: true });
  await writeFile(path.join(repoDir, ".flai", "project.md"), "# Project\n\nShort project.\n", "utf8");
  await writeFile(path.join(repoDir, ".flai", "context-policy.md"), "# Policy\n\nShort policy.\n", "utf8");
  await writeFile(path.join(repoDir, ".flai", "now.md"), `# Now\n\n${"visible ".repeat(80)}TAIL`, "utf8");
  const previousCwd = process.cwd();

  try {
    process.chdir(repoDir);

    const contextStdout = createWritable();
    await runCli({
      argv: ["node", "flai", "context", "startup", "--budget", "1100"],
      stdout: contextStdout.stream,
      stderr: createWritable().stream,
    });

    assert.match(contextStdout.output, /<flai-context mode="startup" budget="1100">/);
    assert.match(contextStdout.output, /<project-now/);

    const sourcesStdout = createWritable();
    await runCli({
      argv: ["node", "flai", "context", "startup", "--sources"],
      stdout: sourcesStdout.stream,
      stderr: createWritable().stream,
    });

    assert.doesNotMatch(sourcesStdout.output, /mode/);
    assert.match(sourcesStdout.output, /startup/);
    assert.doesNotMatch(sourcesStdout.output, /budget/);
    assert.match(sourcesStdout.output, /\/8500/);
    assert.match(sourcesStdout.output, /fit/);
    assert.match(sourcesStdout.output, /true/);
    assert.match(sourcesStdout.output, /source/);
    assert.match(sourcesStdout.output, /reason/);
    assert.match(sourcesStdout.output, /current project state/);
    assert.match(sourcesStdout.output, /preview/);
    assert.match(sourcesStdout.output, /\[flai-context\]/);
    assert.match(sourcesStdout.output, /\[startup\]/);
    assert.match(sourcesStdout.output, /\[rendered context\]/);
    assert.match(sourcesStdout.output, /now\.md/);
    assert.doesNotMatch(sourcesStdout.output, /\.flai\/now\.md/);
  } finally {
    process.chdir(previousCwd);
  }
});

test("runCli task supports create, list, current, start, and finish", async () => {
  const repoDir = await tempRoot("cli-task");
  await mkdir(path.join(repoDir, ".flai"), { recursive: true });
  await writeFile(path.join(repoDir, ".flai", "now.md"), "# Now\n\nCurrent task: none\n", "utf8");
  const previousCwd = process.cwd();

  try {
    process.chdir(repoDir);

    const createStdout = createWritable();
    await runCli({
      argv: ["node", "flai", "task", "create", "Improve context"],
      stdout: createStdout.stream,
      stderr: createWritable().stream,
    });

    assert.match(createStdout.output, /Created task/);
    const tasksDir = path.join(repoDir, ".flai", "tasks");
    const tasks = await readdir(tasksDir);
    const taskName = tasks.find((name) => name.endsWith("improve-context"));
    assert.ok(taskName);

    const listStdout = createWritable();
    await runCli({
      argv: ["node", "flai", "task", "list"],
      stdout: listStdout.stream,
      stderr: createWritable().stream,
    });
    assert.match(listStdout.output, /improve-context/);

    const startStdout = createWritable();
    await runCli({
      argv: ["node", "flai", "task", "start", "improve-context"],
      stdout: startStdout.stream,
      stderr: createWritable().stream,
    });
    assert.match(startStdout.output, /\.flai\/tasks\/.+improve-context\/status\.md/);
    assert.match(startStdout.output, /Current phase: implement/);

    const currentStdout = createWritable();
    await runCli({
      argv: ["node", "flai", "task", "current"],
      stdout: currentStdout.stream,
      stderr: createWritable().stream,
    });
    assert.match(currentStdout.output, /improve-context\/status\.md/);

    const finishStdout = createWritable();
    await runCli({
      argv: ["node", "flai", "task", "finish"],
      stdout: finishStdout.stream,
      stderr: createWritable().stream,
    });
    assert.match(finishStdout.output, /Cleared current task/);
    assert.match(finishStdout.output, /Current phase: startup/);
  } finally {
    process.chdir(previousCwd);
  }
});

test("runCli phase supports current, set, and check", async () => {
  const repoDir = await tempRoot("cli-phase");
  await mkdir(path.join(repoDir, ".flai"), { recursive: true });
  await writeFile(path.join(repoDir, ".flai", "now.md"), "# Now\n\nCurrent task: none\n", "utf8");
  const previousCwd = process.cwd();

  try {
    process.chdir(repoDir);

    const currentStdout = createWritable();
    await runCli({
      argv: ["node", "flai", "phase", "current"],
      stdout: currentStdout.stream,
      stderr: createWritable().stream,
    });
    assert.equal(currentStdout.output, "startup\n");

    const setStdout = createWritable();
    await runCli({
      argv: ["node", "flai", "phase", "set", "review"],
      stdout: setStdout.stream,
      stderr: createWritable().stream,
    });
    assert.equal(setStdout.output, "Current phase: review\n");

    const contextStdout = createWritable();
    await runCli({
      argv: ["node", "flai", "context", "--budget", "1100"],
      stdout: contextStdout.stream,
      stderr: createWritable().stream,
    });
    assert.match(contextStdout.output, /<flai-context mode="review" budget="1100">/);

    const checkStdout = createWritable();
    await runCli({
      argv: ["node", "flai", "phase", "check"],
      stdout: checkStdout.stream,
      stderr: createWritable().stream,
    });
    assert.match(checkStdout.output, /Workflow status: NO_TASK/);
    assert.match(checkStdout.output, /Next command: flai task list/);
    process.exitCode = 0;
  } finally {
    process.chdir(previousCwd);
  }
});

test("cli entrypoint runs when invoked through a symlinked path", async () => {
  const root = await tempRoot("cli-symlink");
  const linkDir = path.join(root, "link");
  const target = path.resolve("src");

  await symlink(target, linkDir, "junction");

  const { stdout } = await execFileAsync(process.execPath, [path.join(linkDir, "cli.mjs"), "help"], {
    cwd: path.resolve("."),
    windowsHide: true,
  });

  assert.match(stdout, /pnpm flai context \[mode\]/);
});
