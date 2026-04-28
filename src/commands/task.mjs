import { existsSync } from "node:fs";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { normalize, normalizePath, readText } from "../lib/common.mjs";

function slugify(value) {
  const slug = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "task";
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

async function uniqueTaskDir(tasksDir, slug) {
  let name = `${todayString()}-${slug}`;
  let suffix = 2;
  while (existsSync(path.join(tasksDir, name))) {
    name = `${todayString()}-${slug}-${suffix}`;
    suffix += 1;
  }
  return name;
}

function taskStatusTemplate(title) {
  return `# Status

## State

planning

## Next

- Clarify the next concrete step.

## Blockers

- None.

## Verification

- Not run.

## Key files

- None yet.

## Title

${title}
`;
}

function emptyTaskTemplate(title, heading) {
  return `# ${heading}

Task: ${title}

- None yet.
`;
}

export async function createTask(options = {}) {
  const repoDir = normalize(options.repoDir ?? process.cwd());
  const title = String(options.title ?? "").trim();
  if (!title) {
    throw new Error("Task title is required.");
  }

  const tasksDir = path.join(repoDir, ".flai", "tasks");
  await mkdir(tasksDir, { recursive: true });
  const name = await uniqueTaskDir(tasksDir, slugify(options.slug ?? title));
  const taskDir = path.join(tasksDir, name);
  await mkdir(taskDir, { recursive: true });

  const files = {
    "status.md": taskStatusTemplate(title),
    "plan.md": emptyTaskTemplate(title, "Plan"),
    "implement.md": emptyTaskTemplate(title, "Implement"),
    "review.md": emptyTaskTemplate(title, "Review"),
    "decisions.md": emptyTaskTemplate(title, "Decisions"),
    "log.md": emptyTaskTemplate(title, "Log"),
    "summary.md": emptyTaskTemplate(title, "Summary"),
  };

  for (const [fileName, content] of Object.entries(files)) {
    await writeFile(path.join(taskDir, fileName), content, "utf8");
  }

  return {
    task: name,
    taskDir,
    statusPath: normalize(path.join(taskDir, "status.md")),
    created: Object.keys(files).map((fileName) => normalize(path.join(taskDir, fileName))),
  };
}

function extractCurrentTaskPath(nowText) {
  const match = nowText.match(/(?:Current task|当前任务)\s*[:：]\s*(.+)/i);
  if (!match) {
    return "";
  }
  const value = match[1].trim().replace(/^`|`$/g, "");
  if (!value || /^(none|no|无)$/i.test(value)) {
    return "";
  }
  return value;
}

export async function getCurrentTask(options = {}) {
  const repoDir = normalize(options.repoDir ?? process.cwd());
  const flaiDir = path.join(repoDir, ".flai");
  const currentFile = path.join(flaiDir, ".current-task");
  const stored = await readText(currentFile);
  if (stored.trim()) {
    return stored.trim();
  }

  return extractCurrentTaskPath(await readText(path.join(flaiDir, "now.md")));
}

async function writeCurrentTask(repoDir, taskRef) {
  const flaiDir = path.join(repoDir, ".flai");
  const nowPath = path.join(flaiDir, "now.md");
  const currentFile = path.join(flaiDir, ".current-task");
  await mkdir(flaiDir, { recursive: true });

  if (taskRef) {
    await writeFile(currentFile, `${taskRef}\n`, "utf8");
  } else {
    await rm(currentFile, { force: true });
  }

  const nowText = await readText(nowPath);
  const replacement = (line) => {
    const isChinese = line.trimStart().startsWith("当前任务");
    return line.replace(/([:：]).*$/, `$1 ${taskRef || (isChinese ? "无" : "none")}`);
  };

  if (!nowText.trim()) {
    await writeFile(nowPath, `# Now\n\nCurrent task: ${taskRef || "none"}\n`, "utf8");
    return;
  }

  const lines = nowText.replace(/\r\n/g, "\n").split("\n");
  const index = lines.findIndex((line) => /^(Current task|当前任务)\s*[:：]/i.test(line.trim()));
  if (index >= 0) {
    lines[index] = replacement(lines[index]);
  } else {
    lines.splice(2, 0, `Current task: ${taskRef || "none"}`);
  }
  await writeFile(nowPath, lines.join("\n"), "utf8");
}

async function resolveTaskName(repoDir, value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    throw new Error("Task name is required.");
  }

  const tasksDir = path.join(repoDir, ".flai", "tasks");
  const direct = path.isAbsolute(raw) ? raw : path.resolve(repoDir, raw);
  if (existsSync(direct) && direct.includes(`${path.sep}.flai${path.sep}tasks${path.sep}`)) {
    return path.basename(direct);
  }

  const entries = existsSync(tasksDir) ? await readdir(tasksDir, { withFileTypes: true }) : [];
  const names = entries.filter((entry) => entry.isDirectory() && entry.name !== "archive").map((entry) => entry.name);
  const normalized = slugify(raw);
  const matches = names.filter((name) => name === raw || name === normalized || name.endsWith(`-${normalized}`));

  if (matches.length === 1) {
    return matches[0];
  }
  if (matches.length > 1) {
    throw new Error(`Task name is ambiguous: ${raw}`);
  }
  throw new Error(`Task not found: ${raw}`);
}

export async function startTask(options = {}) {
  const repoDir = normalize(options.repoDir ?? process.cwd());
  const taskName = await resolveTaskName(repoDir, options.name);
  const taskRef = normalizePath(path.join(".flai", "tasks", taskName, "status.md"));
  await writeCurrentTask(repoDir, taskRef);
  return { task: taskName, current: taskRef };
}

export async function finishTask(options = {}) {
  const repoDir = normalize(options.repoDir ?? process.cwd());
  const previous = await getCurrentTask({ repoDir });
  await writeCurrentTask(repoDir, "");
  return { previous };
}

async function readTaskState(taskDir) {
  const status = await readText(path.join(taskDir, "status.md"));
  const match = status.match(/(?:## State|## 状态)\s+([^\n#]+)/i) ?? status.match(/(?:State|状态)\s*[:：]\s*([^\n]+)/i);
  return match ? match[1].trim().replace(/^- /, "") : "unknown";
}

export async function listTasks(options = {}) {
  const repoDir = normalize(options.repoDir ?? process.cwd());
  const tasksDir = path.join(repoDir, ".flai", "tasks");
  const current = await getCurrentTask({ repoDir });
  if (!existsSync(tasksDir)) {
    return [];
  }

  const entries = await readdir(tasksDir, { withFileTypes: true });
  const tasks = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "archive") {
      continue;
    }
    const statusPath = normalizePath(path.join(".flai", "tasks", entry.name, "status.md"));
    tasks.push({
      task: entry.name,
      state: await readTaskState(path.join(tasksDir, entry.name)),
      current: current === statusPath ? "yes" : "",
    });
  }

  return tasks.sort((left, right) => left.task.localeCompare(right.task));
}
