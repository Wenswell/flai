import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { buildContext } from "../src/context.mjs";

async function makeProject() {
  const root = await mkdtemp(path.join(tmpdir(), "ai-context-"));
  const flai = path.join(root, ".flai");
  const userFlai = path.join(root, "user-flai");
  const taskDir = path.join(flai, "tasks", "2026-04-25-context-hook");

  await mkdir(taskDir, { recursive: true });
  await mkdir(userFlai, { recursive: true });

  await writeFile(
    path.join(userFlai, "preferences.md"),
    "# Preferences\n\n- Use Chinese.\n- Keep answers concise.\n",
    "utf8",
  );
  await writeFile(
    path.join(userFlai, "workflow.md"),
    "# Workflow\n\nDefault to tiny. Escalate only on clear risk.\n",
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
    "# Now\n\nLast updated: 2026-04-25\n\nCurrent task: .flai/tasks/2026-04-25-context-hook/status.md\n\nNext:\n- Implement hook adapters\n",
    "utf8",
  );
  await writeFile(
    path.join(flai, "context-policy.md"),
    "# Context Policy\n\nRead status first. Do not read logs by default.\n",
    "utf8",
  );
  await writeFile(
    path.join(taskDir, "status.md"),
    "# Status\n\nState: active\n\nNext: finish shared script.\n",
    "utf8",
  );
  await writeFile(path.join(taskDir, "log.md"), "SECRET LOG SHOULD NOT LOAD\n", "utf8");

  return { root, userFlai };
}

test("buildContext injects user defaults, project now, active task status, and policy", async () => {
  const { root, userFlai } = await makeProject();

  const context = await buildContext({
    cwd: root,
    userFlaiDir: userFlai,
    maxChars: 5000,
  });

  assert.match(context, /<user-defaults>/);
  assert.match(context, /Use Chinese/);
  assert.match(context, /<project-now>/);
  assert.match(context, /Current task:/);
  assert.match(context, /<active-task-status/);
  assert.match(context, /State: active/);
  assert.match(context, /<context-policy>/);
  assert.doesNotMatch(context, /SECRET LOG SHOULD NOT LOAD/);
});

test("buildContext keeps output under the configured size limit", async () => {
  const { root, userFlai } = await makeProject();

  const context = await buildContext({
    cwd: root,
    userFlaiDir: userFlai,
    maxChars: 700,
  });

  assert.ok(context.length <= 700);
  assert.match(context, /Context trimmed/);
});
