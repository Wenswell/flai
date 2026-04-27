import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import assert from "node:assert/strict";

import { buildContext, buildContextAnalysis, runCli as runContextHook } from "../src/context.mjs";

async function makeProject() {
  const root = await mkdtemp(path.join(tmpdir(), "ai-context-"));
  const flai = path.join(root, ".flai");
  const userFlai = path.join(root, "user-flai");
  const taskDir = path.join(flai, "tasks", "2026-04-25-context-hook");

  await mkdir(taskDir, { recursive: true });
  await mkdir(path.join(flai, "policy"), { recursive: true });
  await mkdir(userFlai, { recursive: true });

  await writeFile(
    path.join(userFlai, "preferences.md"),
    "# Preferences\n\n- Use Chinese.\n- Keep answers concise.\n",
    "utf8",
  );
  await writeFile(
    path.join(userFlai, "failure-patterns.md"),
    "# Failure Patterns\n\n## Small Task Over-Processed\nCorrection: stay tiny unless risk matches.\n",
    "utf8",
  );
  await writeFile(
    path.join(flai, "project.md"),
    "# Project\n\n## Purpose\nLightweight AI workflow.\n\n## Commands\n- test: pnpm test\n",
    "utf8",
  );
  await writeFile(
    path.join(flai, "now.md"),
    "# Now\n\nLast updated: 2026-04-25\n\nCurrent task: .flai/tasks/2026-04-25-context-hook/status.md\n\nCurrent conversation: .flai/conversation.md\n\nNext:\n- Implement hook adapters\n",
    "utf8",
  );
  await writeFile(
    path.join(flai, "conversation.md"),
    "# Conversation\n\n## Conclusions\n\n- Use fixed conversation state.\n",
    "utf8",
  );
  await writeFile(
    path.join(flai, "issues.md"),
    "# Issues\n\n## Open\n\n- [ ] flai-001: add issue flow.\n",
    "utf8",
  );
  await writeFile(
    path.join(flai, "context-policy.md"),
    "# Context Policy\n\nRead status first. Do not read logs by default.\n",
    "utf8",
  );
  await writeFile(
    path.join(flai, "policy", "startup.md"),
    "# Startup Phase\n\n- Read workflow state first.\n",
    "utf8",
  );
  await writeFile(
    path.join(flai, "policy", "review.md"),
    "# Review Phase\n\n- Check regressions.\n",
    "utf8",
  );
  await writeFile(
    path.join(flai, "policy", "implement.md"),
    "# Implement Phase\n\n- Follow task implementation context.\n",
    "utf8",
  );
  await writeFile(
    path.join(taskDir, "status.md"),
    "# Status\n\nState: active\n\nNext: finish shared script.\n",
    "utf8",
  );
  await writeFile(path.join(taskDir, "implement.md"), "# Implement\n\nUse the hook context.\n", "utf8");
  await writeFile(path.join(taskDir, "log.md"), "SECRET LOG SHOULD NOT LOAD\n", "utf8");

  return { root, userFlai };
}

test("buildContext injects user defaults, project now, active task status, and policy", async () => {
  const { root, userFlai } = await makeProject();

  const context = await buildContext({
    cwd: root,
    userFlaiDir: userFlai,
    budget: 5000,
  });

  assert.match(context, /<flai-context mode="startup"/);
  assert.match(context, /<user-preferences\.md/);
  assert.match(context, /Use Chinese/);
  assert.doesNotMatch(context, /user-workflow\.md/);
  assert.doesNotMatch(context, /Failure Patterns/);
  assert.match(context, /<project-now/);
  assert.match(context, /Current task:/);
  assert.match(context, /<conversation/);
  assert.match(context, /Use fixed conversation state/);
  assert.match(context, /<task-status\.md/);
  assert.match(context, /State: active/);
  assert.match(context, /<workflow-state/);
  assert.doesNotMatch(context, /<mode-rule/);
  assert.match(context, /Active phase: startup/);
  assert.match(context, /Sync target: \.flai\/conversation\.md/);
  assert.match(context, /wait for explicit user confirmation/);
  assert.match(context, /read-only context inspection is allowed/);
  assert.ok(context.indexOf("<workflow-state") < context.indexOf("<project-now"));
  assert.match(context, /<phase-policy/);
  assert.match(context, /Read workflow state first/);
  assert.doesNotMatch(context, /SECRET LOG SHOULD NOT LOAD/);
});

function captureWritable() {
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

test("context hook injects workflow gate on session start", async () => {
  const { root } = await makeProject();
  const stdout = captureWritable();

  await runContextHook({
    argv: ["node", "hook", "--client", "claude"],
    stdin: Readable.from([JSON.stringify({ cwd: root })]),
    stdout: stdout.stream,
  });

  const result = JSON.parse(stdout.output);
  const context = result.hookSpecificOutput.additionalContext;

  assert.match(result.systemMessage, /startup, READY/);
  assert.match(context, /<workflow-gate>/);
  assert.match(context, /Active phase: startup/);
  assert.match(context, /Phase policy: \.flai\/policy\/startup\.md/);
  assert.match(context, /<phase-policy/);
});

test("claude pre-tool hook injects phase context into agent prompt", async () => {
  const { root } = await makeProject();
  const stdout = captureWritable();

  await runContextHook({
    argv: ["node", "hook", "--client", "claude", "--event", "pre-tool-use"],
    stdin: Readable.from([
      JSON.stringify({
        cwd: root,
        tool_name: "Task",
        tool_input: {
          subagent_type: "implement",
          prompt: "Implement the change.",
        },
      }),
    ]),
    stdout: stdout.stream,
  });

  const result = JSON.parse(stdout.output);
  const updated = result.hookSpecificOutput.updatedInput;

  assert.equal(result.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.equal(result.hookSpecificOutput.permissionDecision, "allow");
  assert.equal(updated.subagent_type, "implement");
  assert.match(updated.prompt, /# Flai implement Context/);
  assert.match(updated.prompt, /<workflow-gate>/);
  assert.match(updated.prompt, /Active phase: implement/);
  assert.match(updated.prompt, /<flai-context mode="implement"/);
  assert.match(updated.prompt, /Follow task implementation context/);
  assert.match(updated.prompt, /Implement the change\./);
  assert.equal((await readFile(path.join(root, ".flai", ".phase"), "utf8")).trim(), "implement");
});

test("explicit context mode drives workflow-state even when saved phase differs", async () => {
  const { root, userFlai } = await makeProject();
  await writeFile(path.join(root, ".flai", ".phase"), "startup\n", "utf8");

  const context = await buildContext({
    cwd: root,
    userFlaiDir: userFlai,
    mode: "review",
    budget: 5000,
  });

  assert.match(context, /<flai-context mode="review"/);
  assert.match(context, /Active phase: review/);
  assert.doesNotMatch(context, /Saved phase/);
  assert.doesNotMatch(context, /<conversation/);
  assert.doesNotMatch(context, /Use fixed conversation state/);
  assert.doesNotMatch(context, /Sync target: \.flai\/conversation\.md/);
  assert.match(context, /review phase should have review\.md checks/);
  assert.match(context, /Next command: flai context review --sources/);
  assert.match(context, /Check regressions/);
});

test("buildContext keeps output under the configured size limit", async () => {
  const { root, userFlai } = await makeProject();

  const context = await buildContext({
    cwd: root,
    userFlaiDir: userFlai,
    budget: 700,
  });

  assert.ok(context.length <= 700);
  assert.match(context, /<flai-context mode="startup"/);
});

test("buildContextAnalysis shows source rows with token counts and previews", async () => {
  const { root, userFlai } = await makeProject();
  const longText = `# Now\n\n${"visible ".repeat(80)}TAIL`;
  await writeFile(path.join(root, ".flai", "now.md"), longText, "utf8");

  const analysis = await buildContextAnalysis({
    cwd: root,
    userFlaiDir: userFlai,
  });
  const nowRow = analysis.rows.find((row) => row.source === ".flai/now.md");

  assert.equal(analysis.mode, "startup");
  assert.equal(analysis.budget, 8500);
  assert.ok(nowRow);
  assert.equal(nowRow.type, "file");
  assert.equal(typeof nowRow.tokens, "number");
  assert.equal(nowRow.reason, "current project state");
  assert.match(nowRow.preview, /# Now visible/);
  assert.doesNotMatch(nowRow.preview, /TAIL/);
});
