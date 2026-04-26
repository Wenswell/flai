#!/usr/bin/env node

import { execFile } from "node:child_process";
import { Console } from "node:console";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

import { buildContext, buildContextAnalysis } from "./context.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const TEMPLATES_DIR = path.join(ROOT_DIR, "templates");
const PACKAGE_JSON = JSON.parse(await readFile(path.join(ROOT_DIR, "package.json"), "utf8"));
const USER_MANIFEST = ".manifest.json";
const execFileAsync = promisify(execFile);

function normalize(value) {
  return path.resolve(value);
}

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}

async function writeIfMissing(filePath, content, result, force = false) {
  const target = normalize(filePath);
  await mkdir(path.dirname(target), { recursive: true });

  if (existsSync(target) && !force) {
    result.skipped.push(target);
    return;
  }

  await writeFile(target, content, "utf8");
  result.created.push(target);
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

async function listFilesRecursive(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(fullPath, base)));
    } else if (entry.isFile()) {
      files.push(path.relative(base, fullPath));
    }
  }
  return files.sort();
}

function renderTemplate(text, values) {
  return text
    .replaceAll("{{PROJECT_NAME}}", values.projectName ?? "")
    .replaceAll("{{DATE}}", values.date ?? "")
    .replaceAll("{{CONTEXT_MODULE_URL}}", values.contextModuleUrl ?? "");
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function readText(filePath, fallback = "") {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return fallback;
  }
}

async function readUserTemplates() {
  const userTemplateDir = path.join(TEMPLATES_DIR, "user");
  const templates = [];
  for (const name of await listFilesRecursive(userTemplateDir)) {
    const content = await readFile(path.join(userTemplateDir, name), "utf8");
    templates.push({ name, content, sha256: sha256(content) });
  }
  return templates;
}

async function writeUserManifest(userFlaiDir, files) {
  await writeFile(
    path.join(userFlaiDir, USER_MANIFEST),
    `${JSON.stringify(
      {
        package: PACKAGE_JSON.name,
        version: PACKAGE_JSON.version,
        updatedAt: new Date().toISOString(),
        files,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

export async function initUser(options = {}) {
  const userFlaiDir = normalize(options.userFlaiDir ?? path.join(os.homedir(), ".flai"));
  const result = { created: [], skipped: [], userFlaiDir };
  const manifestFiles = {};

  for (const template of await readUserTemplates()) {
    const target = path.join(userFlaiDir, template.name);
    await writeIfMissing(target, template.content, result, Boolean(options.force));
    if (Boolean(options.force) || !existsSync(target) || (await readFile(target, "utf8")) === template.content) {
      manifestFiles[template.name] = { sha256: template.sha256 };
    }
  }

  await mkdir(userFlaiDir, { recursive: true });
  await writeUserManifest(userFlaiDir, manifestFiles);
  return result;
}

export async function updateUser(options = {}) {
  const userFlaiDir = normalize(options.userFlaiDir ?? path.join(os.homedir(), ".flai"));
  const result = { created: [], updated: [], skipped: [], conflicts: [], userFlaiDir };
  const previous = await readJson(path.join(userFlaiDir, USER_MANIFEST), { files: {} });
  const manifestFiles = {};

  await mkdir(userFlaiDir, { recursive: true });

  for (const template of await readUserTemplates()) {
    const target = path.join(userFlaiDir, template.name);
    const previousHash = previous.files?.[template.name]?.sha256;

    if (!existsSync(target)) {
      await writeFile(target, template.content, "utf8");
      result.created.push(target);
      manifestFiles[template.name] = { sha256: template.sha256 };
      continue;
    }

    const current = await readFile(target, "utf8");
    const currentHash = sha256(current);

    if (options.force || (previousHash && currentHash === previousHash)) {
      if (current !== template.content) {
        await writeFile(target, template.content, "utf8");
        result.updated.push(target);
      } else {
        result.skipped.push(target);
      }
      manifestFiles[template.name] = { sha256: template.sha256 };
      continue;
    }

    if (currentHash === template.sha256) {
      result.skipped.push(target);
      manifestFiles[template.name] = { sha256: template.sha256 };
      continue;
    }

    result.conflicts.push(target);
  }

  await writeUserManifest(userFlaiDir, manifestFiles);
  return result;
}

async function defaultRunCommand(command, args) {
  await execFileAsync(command, args, { windowsHide: true });
}

export async function selfUpdate(options = {}) {
  const userFlaiDir = normalize(options.userFlaiDir ?? path.join(os.homedir(), ".flai"));
  const runCommand = options.runCommand ?? defaultRunCommand;
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const flaiCommand = process.env.FLAI_BIN || "flai";
  const npmArgs = ["install", "-g", `${PACKAGE_JSON.name}@latest`];
  const updateUserArgs = ["update-user", userFlaiDir];
  const result = { packageName: PACKAGE_JSON.name, userFlaiDir, commands: [] };

  if (options.force) {
    updateUserArgs.push("-f");
  }

  await runCommand(npmCommand, npmArgs);
  result.commands.push([npmCommand, ...npmArgs].join(" "));

  await runCommand(flaiCommand, updateUserArgs);
  result.commands.push([flaiCommand, ...updateUserArgs].join(" "));

  return result;
}

export async function uninstallUser(options = {}) {
  const userFlaiDir = normalize(options.userFlaiDir ?? path.join(os.homedir(), ".flai"));
  if (!options.confirm) {
    throw new Error("Refusing to uninstall user data without -f.");
  }

  await rm(userFlaiDir, { recursive: true, force: true });
  return { removed: userFlaiDir };
}

export async function initProject(options = {}) {
  const repoDir = normalize(options.repoDir ?? process.cwd());
  const result = { created: [], skipped: [], repoDir };
  const force = Boolean(options.force);
  const projectTemplateDir = path.join(TEMPLATES_DIR, "project");
  const values = {
    projectName: path.basename(repoDir),
    date: new Date().toISOString().slice(0, 10),
    contextModuleUrl: pathToFileURL(path.join(SCRIPT_DIR, "context.mjs")).href,
  };

  for (const relativePath of await listFilesRecursive(projectTemplateDir)) {
    const content = await readFile(path.join(projectTemplateDir, relativePath), "utf8");
    await writeIfMissing(path.join(repoDir, relativePath), renderTemplate(content, values), result, force);
  }

  await mkdir(path.join(repoDir, ".flai", "tasks"), { recursive: true });

  return result;
}

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

function parseArgs(argv) {
  const command = argv[2];
  const args = {
    command,
    repoDir: undefined,
    userFlaiDir: undefined,
    values: [],
    mode: "startup",
    taskAction: undefined,
    taskValue: undefined,
    force: false,
    confirm: false,
    help: false,
    budget: undefined,
    sources: false,
    errors: [],
  };

  for (let index = 3; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--user-dir") {
      args.userFlaiDir = argv[index + 1];
      index += 1;
    } else if (value === "--budget") {
      args.budget = Number(argv[index + 1]);
      index += 1;
    } else if (value === "--sources") {
      args.sources = true;
    } else if (value === "-f" || value === "--force") {
      args.force = true;
      args.confirm = true;
    } else if (value === "-h" || value === "--help" || value === "help") {
      args.help = true;
    } else if (value.startsWith("-")) {
      args.errors.push(`Unknown option: ${value}`);
    } else {
      args.values.push(value);
    }
  }

  if (args.command === "context") {
    args.mode = args.values[0] ?? "startup";
  } else if (args.command === "task") {
    args.taskAction = args.values[0];
    args.taskValue = args.values[1];
  } else {
    args.repoDir = args.values[0];
    args.userFlaiDir = args.values[0];
  }

  return args;
}

function usage() {
  return `Usage:
  pnpm flai init [path] [-f]              Initialize a project with .flai docs and hooks
  pnpm flai context [mode] [--budget N]   Print rendered context for startup, brainstorm, implement, review, debug, or task
  pnpm flai context [mode] --sources      Print compact source table for a context mode
  pnpm flai task create "title"           Create a lightweight task
  pnpm flai task start <name>             Set the current task
  pnpm flai task list                     List active tasks
  pnpm flai task current                  Print the current task
  pnpm flai task finish                   Clear the current task
  pnpm flai user [path] [-f]              Initialize user-level defaults, usually ~/.flai
  pnpm flai update-user [path] [-f]       Update managed user defaults from installed templates
  pnpm flai self-update [path] [-f]       Update the global flai package, then user defaults
  pnpm flai uninstall-user [path] -f      Remove user-level defaults; requires -f
  pnpm flai help                          Show this help
`;
}

function printResult(stdout, label, result) {
  stdout.write(`${label}\n`);
  if (result.userFlaiDir) stdout.write(`userFlaiDir: ${result.userFlaiDir}\n`);
  if (result.repoDir) stdout.write(`repoDir: ${result.repoDir}\n`);
  if (result.packageName) stdout.write(`package: ${result.packageName}\n`);
  if (result.removed) stdout.write(`removed: ${result.removed}\n`);
  if (result.commands?.length) stdout.write(`commands:\n${result.commands.map((item) => `- ${item}`).join("\n")}\n`);
  if (result.created?.length) stdout.write(`created:\n${result.created.map((item) => `- ${item}`).join("\n")}\n`);
  if (result.updated?.length) stdout.write(`updated:\n${result.updated.map((item) => `- ${item}`).join("\n")}\n`);
  if (result.skipped?.length) stdout.write(`skipped:\n${result.skipped.map((item) => `- ${item}`).join("\n")}\n`);
  if (result.conflicts?.length) stdout.write(`conflicts:\n${result.conflicts.map((item) => `- ${item}`).join("\n")}\n`);
}

function writeTable(stdout, stderr, rows) {
  if (typeof stdout.removeListener === "function") {
    new Console({ stdout, stderr }).table(rows);
    return;
  }

  stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
}

export async function runCli({ argv = process.argv, stdout = process.stdout, stderr = process.stderr } = {}) {
  const args = parseArgs(argv);

  if (!args.command || args.help || args.command === "help") {
    stdout.write(usage());
    return;
  }

  if (args.errors.length) {
    stderr.write(`${args.errors.join("\n")}\n\n${usage()}`);
    process.exitCode = 1;
    return;
  }

  if (args.command === "user") {
    printResult(stdout, "Initialized user .flai data.", await initUser(args));
    return;
  }

  if (args.command === "update-user") {
    printResult(stdout, "Updated user .flai data.", await updateUser(args));
    return;
  }

  if (args.command === "self-update") {
    printResult(stdout, "Updated flai package and user .flai data.", await selfUpdate(args));
    return;
  }

  if (args.command === "uninstall-user") {
    printResult(stdout, "Uninstalled user .flai data.", await uninstallUser(args));
    return;
  }

  if (args.command === "init") {
    args.repoDir = args.repoDir ?? process.cwd();
    printResult(stdout, "Initialized project .flai data.", await initProject(args));
    return;
  }

  if (args.command === "context") {
    if (args.sources) {
      const analysis = await buildContextAnalysis({
        cwd: process.cwd(),
        mode: args.mode,
        budget: args.budget,
      });
      stdout.write(`mode: ${analysis.mode}\nbudget: ${analysis.budget}\nused: ${analysis.text.length}\n`);
      writeTable(
        stdout,
        stderr,
        analysis.rows.map(({ source, type, chars, tokens, state, preview }) => ({
          source,
          type,
          chars,
          tokens,
          state,
          preview,
        })),
      );
      return;
    }

    stdout.write(
      `${await buildContext({
        cwd: process.cwd(),
        mode: args.mode,
        budget: args.budget,
      })}\n`,
    );
    return;
  }

  if (args.command === "task") {
    if (args.taskAction === "create") {
      printResult(stdout, "Created task.", await createTask({ repoDir: process.cwd(), title: args.taskValue }));
      return;
    }

    if (args.taskAction === "start") {
      const result = await startTask({ repoDir: process.cwd(), name: args.taskValue });
      stdout.write(`Current task: ${result.current}\n`);
      return;
    }

    if (args.taskAction === "finish") {
      const result = await finishTask({ repoDir: process.cwd() });
      stdout.write(result.previous ? `Cleared current task: ${result.previous}\n` : "No current task.\n");
      return;
    }

    if (args.taskAction === "current") {
      const current = await getCurrentTask({ repoDir: process.cwd() });
      stdout.write(current ? `${current}\n` : "none\n");
      return;
    }

    if (args.taskAction === "list") {
      const tasks = await listTasks({ repoDir: process.cwd() });
      if (!tasks.length) {
        stdout.write("No active tasks.\n");
        return;
      }
      writeTable(stdout, stderr, tasks);
      return;
    }

    stderr.write(usage());
    process.exitCode = 1;
    return;
  }

  stderr.write(usage());
  process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
