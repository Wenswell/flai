#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

import { buildContext, buildContextAnalysis } from "./context.mjs";
import { initProject as initProjectCommand } from "./commands/init.mjs";
import { printResult, writeTable } from "./commands/output.mjs";
import { checkPhase, getCurrentPhase, setCurrentPhase } from "./commands/phase.mjs";
import {
  createTask,
  finishTask,
  getCurrentTask,
  listTasks,
  startTask,
} from "./commands/task.mjs";
import {
  initUser as initUserCommand,
  selfUpdate as selfUpdateCommand,
  uninstallUser,
  updateUser as updateUserCommand,
} from "./commands/user.mjs";
import { isMainModule } from "./lib/common.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const TEMPLATES_DIR = path.join(ROOT_DIR, "templates");
const PACKAGE_JSON = JSON.parse(await readFile(path.join(ROOT_DIR, "package.json"), "utf8"));

function sourceFileName(source) {
  return path.posix.basename(source.replaceAll("\\", "/"));
}

function withRuntime(options = {}) {
  return {
    ...options,
    packageJson: PACKAGE_JSON,
    scriptDir: SCRIPT_DIR,
    templatesDir: TEMPLATES_DIR,
  };
}

export async function initUser(options = {}) {
  return initUserCommand(withRuntime(options));
}

export async function updateUser(options = {}) {
  return updateUserCommand(withRuntime(options));
}

export async function selfUpdate(options = {}) {
  return selfUpdateCommand(withRuntime(options));
}

export async function initProject(options = {}) {
  return initProjectCommand(withRuntime(options));
}

export { createTask, finishTask, getCurrentTask, listTasks, startTask, uninstallUser };

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
    phaseAction: undefined,
    phaseValue: undefined,
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
  } else if (args.command === "phase") {
    args.phaseAction = args.values[0];
    args.phaseValue = args.values[1];
  } else {
    args.repoDir = args.values[0];
    args.userFlaiDir = args.values[0];
  }

  return args;
}

function usage() {
  return `Usage:
  pnpm flai init [path] [-f]              Initialize a project with .flai docs and hooks
  pnpm flai context [mode] [--budget N]   Print rendered context for startup, brainstorm, implement, review, or debug
  pnpm flai context [mode] --sources      Print compact source table for a context mode
  pnpm flai task create "title"           Create a lightweight task
  pnpm flai task start <name>             Set the current task
  pnpm flai task list                     List active tasks
  pnpm flai task current                  Print the current task
  pnpm flai task finish                   Clear the current task
  pnpm flai phase current                 Print the current workflow phase
  pnpm flai phase set <mode>              Set startup, brainstorm, implement, review, or debug
  pnpm flai phase check                   Check current phase requirements
  pnpm flai user [path] [-f]              Initialize user-level defaults, usually ~/.flai
  pnpm flai update-user [path] [-f]       Update managed user defaults from installed templates
  pnpm flai self-update [path] [-f]       Update the global flai package, then user defaults
  pnpm flai uninstall-user [path] -f      Remove user-level defaults; requires -f
  pnpm flai help                          Show this help
`;
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
    const mode = args.values[0] ? args.mode : await getCurrentPhase({ repoDir: process.cwd() });
    if (args.sources) {
      const analysis = await buildContextAnalysis({
        cwd: process.cwd(),
        mode,
        budget: args.budget,
      });
      writeTable(
        stdout,
        stderr,
        [
          {
            source: "[flai-context]",
            type: `[${analysis.mode}]`,
            chars: `${analysis.text.length}/${analysis.budget}`,
            tokens: analysis.tokens,
            fit: true,
            reason: "[rendered context]",
            preview: "",
          },
          ...analysis.rows.map(({ source, budget: sourceBudget, type, tokens, state, reason, preview, renderedChars }) => ({
            source: sourceFileName(source),
            type,
            chars: `${renderedChars}/${sourceBudget}`,
            tokens,
            fit: state === "used" ? true : state,
            reason,
            preview,
          })),
        ],
      );
      return;
    }

    stdout.write(
      `${await buildContext({
        cwd: process.cwd(),
        mode,
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
      await setCurrentPhase({ repoDir: process.cwd(), phase: "implement" });
      stdout.write(`Current task: ${result.current}\n`);
      stdout.write("Current phase: implement\n");
      return;
    }

    if (args.taskAction === "finish") {
      const result = await finishTask({ repoDir: process.cwd() });
      await setCurrentPhase({ repoDir: process.cwd(), phase: "startup" });
      stdout.write(result.previous ? `Cleared current task: ${result.previous}\n` : "No current task.\n");
      stdout.write("Current phase: startup\n");
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

  if (args.command === "phase") {
    if (args.phaseAction === "current") {
      stdout.write(`${await getCurrentPhase({ repoDir: process.cwd() })}\n`);
      return;
    }

    if (args.phaseAction === "set") {
      const result = await setCurrentPhase({ repoDir: process.cwd(), phase: args.phaseValue });
      stdout.write(`Current phase: ${result.phase}\n`);
      return;
    }

    if (args.phaseAction === "check") {
      const result = await checkPhase({ repoDir: process.cwd() });
      if (result.ok) {
        stdout.write(`Workflow status: ${result.status}\nCurrent phase: ${result.phase}\nNext command: ${result.nextCommand}\n`);
        return;
      }
      stdout.write(
        `Workflow status: ${result.status}\nCurrent phase: ${result.phase}\nNext command: ${result.nextCommand}\n${result.issues.map((issue) => `- ${issue}`).join("\n")}\n`,
      );
      process.exitCode = 1;
      return;
    }

    stderr.write(usage());
    process.exitCode = 1;
    return;
  }

  stderr.write(usage());
  process.exitCode = 1;
}

if (isMainModule(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
