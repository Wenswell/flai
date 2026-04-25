#!/usr/bin/env node

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { buildContext } from "./context.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const TEMPLATES_DIR = path.join(ROOT_DIR, "templates");

function normalize(value) {
  return path.resolve(value);
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

export async function initUser(options = {}) {
  const userFlaiDir = normalize(options.userFlaiDir ?? path.join(os.homedir(), ".flai"));
  const result = { created: [], skipped: [], userFlaiDir };

  const userTemplateDir = path.join(TEMPLATES_DIR, "user");
  for (const name of await listFilesRecursive(userTemplateDir)) {
    const content = await readFile(path.join(userTemplateDir, name), "utf8");
    await writeIfMissing(path.join(userFlaiDir, name), content, result, Boolean(options.force));
  }

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

function parseArgs(argv) {
  const command = argv[2];
  const args = {
    command,
    path: undefined,
    repoDir: undefined,
    userFlaiDir: undefined,
    force: false,
    confirm: false,
    help: false,
    maxChars: undefined,
  };

  for (let index = 3; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--repo") {
      args.repoDir = argv[index + 1];
      index += 1;
    } else if (value === "--user-dir") {
      args.userFlaiDir = argv[index + 1];
      index += 1;
    } else if (value === "--max" || value === "--max-chars") {
      args.maxChars = Number(argv[index + 1]);
      index += 1;
    } else if (value === "-f" || value === "--force") {
      args.force = true;
      args.confirm = true;
    } else if (value === "-h" || value === "--help" || value === "help") {
      args.help = true;
    } else if (!args.path) {
      args.path = value;
    }
  }

  if (!args.repoDir && args.path) {
    args.repoDir = args.path;
  }
  if (!args.userFlaiDir && args.path) {
    args.userFlaiDir = args.path;
  }

  return args;
}

function usage() {
  return `Usage:
  pnpm flai init [path] [-f]              Initialize a project with .flai docs and hooks
  pnpm flai user [path] [-f]              Initialize user-level defaults, usually ~/.flai
  pnpm flai uninstall-user [path] -f      Remove user-level defaults; requires -f
  pnpm flai context [path] [--max <chars>] Print startup context for a project
  pnpm flai help                          Show this help
`;
}

function printResult(stdout, label, result) {
  stdout.write(`${label}\n`);
  if (result.userFlaiDir) stdout.write(`userFlaiDir: ${result.userFlaiDir}\n`);
  if (result.repoDir) stdout.write(`repoDir: ${result.repoDir}\n`);
  if (result.removed) stdout.write(`removed: ${result.removed}\n`);
  if (result.created?.length) stdout.write(`created:\n${result.created.map((item) => `- ${item}`).join("\n")}\n`);
  if (result.skipped?.length) stdout.write(`skipped:\n${result.skipped.map((item) => `- ${item}`).join("\n")}\n`);
}

export async function runCli({ argv = process.argv, stdout = process.stdout, stderr = process.stderr } = {}) {
  const args = parseArgs(argv);

  if (!args.command || args.help || args.command === "help") {
    stdout.write(usage());
    return;
  }

  if (args.command === "user") {
    printResult(stdout, "Initialized user .flai data.", await initUser(args));
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
    stdout.write(`${await buildContext({ cwd: args.path ?? process.cwd(), maxChars: args.maxChars })}\n`);
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
