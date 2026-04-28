#!/usr/bin/env node

import { Console } from "node:console";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";

import { buildContext, buildContextAnalysis } from "./context.mjs";
import {
  initProject as initProjectCommand,
  listProjectUpdateCandidates as listProjectUpdateCandidatesCommand,
} from "./commands/init.mjs";
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

export async function listProjectUpdateCandidates(options = {}) {
  return listProjectUpdateCandidatesCommand(withRuntime(options));
}

export { createTask, finishTask, getCurrentTask, listTasks, startTask, uninstallUser };

function renderUpdateTable(stdout, stderr, candidates, cursor, selected) {
  stdout.write("\x1Bc");
  stdout.write("Select project install files to update.\n");
  stdout.write("Use Up/Down to move, Space to toggle, a to select all, n to clear, Enter to apply, q/Esc to cancel.\n\n");

  const rows = {};
  candidates.forEach((candidate, index) => {
    const marker = index === cursor ? ">" : " ";
    const checked = selected.has(candidate.relativePath) ? "[x]" : "[ ]";
    rows[`${marker} ${checked} ${index + 1}`] = {
      action: candidate.action,
      file: candidate.relativePath,
    };
  });

  new Console({ stdout, stderr }).table(rows);
}

export async function selectProjectUpdates(candidates, { stdin = process.stdin, stdout = process.stdout, stderr = process.stderr } = {}) {
  const choices = candidates.filter((candidate) => candidate.action !== "same");
  if (!choices.length) {
    stdout.write("No project install files need update.\n");
    return [];
  }

  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    stdout.write("Interactive update requires a TTY.\n");
    return [];
  }

  readline.emitKeypressEvents(stdin);
  const selected = new Set();
  let cursor = 0;
  const previousRawMode = Boolean(stdin.isRaw);

  stdin.setRawMode(true);
  stdin.resume();
  renderUpdateTable(stdout, stderr, choices, cursor, selected);

  return await new Promise((resolve) => {
    const finish = (value) => {
      stdin.off("keypress", onKeypress);
      stdin.setRawMode(previousRawMode);
      resolve(value);
    };

    const onKeypress = (text, key = {}) => {
      if (key.ctrl && key.name === "c") {
        stdout.write("\nCanceled.\n");
        finish(null);
        return;
      }

      if (key.name === "escape" || key.name === "q") {
        stdout.write("\nCanceled.\n");
        finish(null);
        return;
      }

      if (key.name === "up") {
        cursor = Math.max(0, cursor - 1);
        renderUpdateTable(stdout, stderr, choices, cursor, selected);
        return;
      }

      if (key.name === "down") {
        cursor = Math.min(choices.length - 1, cursor + 1);
        renderUpdateTable(stdout, stderr, choices, cursor, selected);
        return;
      }

      if (key.name === "space") {
        const item = choices[cursor];
        if (selected.has(item.relativePath)) {
          selected.delete(item.relativePath);
        } else {
          selected.add(item.relativePath);
        }
        renderUpdateTable(stdout, stderr, choices, cursor, selected);
        return;
      }

      if (text === "a") {
        for (const choice of choices) {
          selected.add(choice.relativePath);
        }
        renderUpdateTable(stdout, stderr, choices, cursor, selected);
        return;
      }

      if (text === "n") {
        selected.clear();
        renderUpdateTable(stdout, stderr, choices, cursor, selected);
        return;
      }

      if (key.name === "return" || key.name === "enter") {
        finish([...selected]);
      }
    };

    stdin.on("keypress", onKeypress);
  });
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
    phaseAction: undefined,
    phaseValue: undefined,
    force: false,
    update: false,
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
    } else if (value === "-u" || value === "--update") {
      args.update = true;
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
  pnpm flai init [path] [-u]              Initialize project files, or interactively update hooks and skills
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

export async function runCli({
  argv = process.argv,
  stdin = process.stdin,
  stdout = process.stdout,
  stderr = process.stderr,
  chooseProjectUpdates = selectProjectUpdates,
} = {}) {
  const args = parseArgs(argv);

  if (args.command === "init" && args.force) {
    args.errors.push("Option -f/--force is not supported for init.");
  }

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
    if (args.update) {
      const candidates = await listProjectUpdateCandidates(args);
      const selectedUpdatePaths = await chooseProjectUpdates(candidates, { stdin, stdout, stderr });
      if (selectedUpdatePaths === null) {
        return;
      }
      printResult(stdout, "Updated project install files.", await initProject({ ...args, selectedUpdatePaths }));
      return;
    }

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
