#!/usr/bin/env node

import { Console } from "node:console";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";

import { buildContext, buildContextAnalysis } from "./context.mjs";
import {
  countIgnoredProjectTemplates as countIgnoredProjectTemplatesCommand,
  initProject as initProjectCommand,
  listProjectUpdateCandidates as listProjectUpdateCandidatesCommand,
} from "./commands/init.mjs";
import { printResult, writeInstallSummary, writeTable } from "./commands/output.mjs";
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

export async function countIgnoredProjectTemplates(options = {}) {
  return countIgnoredProjectTemplatesCommand(withRuntime(options));
}

export { createTask, finishTask, getCurrentTask, listTasks, startTask, uninstallUser };

function renderUpdateTable(stdout, stderr, candidates, choices, cursor, selected) {
  stdout.write("\x1Bc");
  writeUpdateSummary(stdout, stderr, candidates);
  stdout.write("\n");
  stdout.write("Select project install files to update.\n");
  stdout.write("Use Up/Down to move, Space to toggle, a to select all, n to clear, Enter to apply, q/Esc to cancel.\n\n");

  const rows = {};
  choices.forEach((candidate, index) => {
    const marker = index === cursor ? ">" : " ";
    const checked = selected.has(candidate.relativePath) ? "[x]" : "[ ]";
    rows[`${marker} ${checked} ${index + 1}`] = {
      action: candidate.action,
      file: candidate.relativePath,
    };
  });

  new Console({ stdout, stderr }).table(rows);
}

function writeUpdateSummary(stdout, stderr, candidates) {
  const summary = candidates.summary ?? {
    create: candidates.filter((candidate) => candidate.action === "create").length,
    update: candidates.filter((candidate) => candidate.action === "update").length,
    same: candidates.filter((candidate) => candidate.action === "same").length,
    ignored: 0,
  };

  writeInstallSummary(stdout, stderr, summary);
}

export async function selectProjectUpdates(candidates, { stdin = process.stdin, stdout = process.stdout, stderr = process.stderr } = {}) {
  const choices = candidates.filter((candidate) => candidate.action !== "same");
  if (!choices.length) {
    writeUpdateSummary(stdout, stderr, candidates);
    stdout.write("No project install files need update.\n");
    return [];
  }

  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    writeUpdateSummary(stdout, stderr, candidates);
    stdout.write("Interactive update requires a TTY.\n");
    return [];
  }

  readline.emitKeypressEvents(stdin);
  const selected = new Set();
  let cursor = 0;
  const previousRawMode = Boolean(stdin.isRaw);

  stdin.setRawMode(true);
  stdin.resume();
  renderUpdateTable(stdout, stderr, candidates, choices, cursor, selected);

  return await new Promise((resolve) => {
    const finish = (value) => {
      stdin.off("keypress", onKeypress);
      stdin.setRawMode(previousRawMode);
      stdin.pause();
      stdout.write("\n");
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
        renderUpdateTable(stdout, stderr, candidates, choices, cursor, selected);
        return;
      }

      if (key.name === "down") {
        cursor = Math.min(choices.length - 1, cursor + 1);
        renderUpdateTable(stdout, stderr, candidates, choices, cursor, selected);
        return;
      }

      if (key.name === "space") {
        const item = choices[cursor];
        if (selected.has(item.relativePath)) {
          selected.delete(item.relativePath);
        } else {
          selected.add(item.relativePath);
        }
        renderUpdateTable(stdout, stderr, candidates, choices, cursor, selected);
        return;
      }

      if (text === "a") {
        for (const choice of choices) {
          selected.add(choice.relativePath);
        }
        renderUpdateTable(stdout, stderr, candidates, choices, cursor, selected);
        return;
      }

      if (text === "n") {
        selected.clear();
        renderUpdateTable(stdout, stderr, candidates, choices, cursor, selected);
        return;
      }

      if (key.name === "return" || key.name === "enter") {
        finish([...selected]);
      }
    };

    stdin.on("keypress", onKeypress);
  });
}

async function confirmProjectUpdate({ stdin = process.stdin, stdout = process.stdout } = {}) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    stdout.write("Run `flai init <path> -u` to choose updates.\n");
    return false;
  }

  readline.emitKeypressEvents(stdin);
  const previousRawMode = Boolean(stdin.isRaw);
  stdin.setRawMode(true);
  stdin.resume();
  stdout.write("Install files can be updated. Open update picker now? [y/N] ");

  return await new Promise((resolve) => {
    const finish = (value) => {
      stdin.off("keypress", onKeypress);
      stdin.setRawMode(previousRawMode);
      stdin.pause();
      stdout.write("\n");
      resolve(value);
    };

    const onKeypress = (text, key = {}) => {
      if (key.ctrl && key.name === "c") {
        finish(false);
        return;
      }
      if (key.name === "return" || key.name === "enter" || key.name === "escape") {
        finish(false);
        return;
      }
      if (text === "y" || text === "Y") {
        finish(true);
        return;
      }
      if (text === "n" || text === "N" || key.name === "q") {
        finish(false);
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
    verbose: false,
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
    } else if (value === "-v" || value === "--verbose") {
      args.verbose = true;
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
  return `flai

Setup:
  flai init [path]              Set up flai in a project
  flai init [path] -u           Update hooks and skills interactively
  flai user [path]              Set up user preferences

Daily commands:
  flai context [mode]           Print current AI context
  flai context [mode] --sources Show context source summary
  flai task create "title"      Create a task
  flai task start <name>        Start a task
  flai task finish              Finish current task

Project state:
  flai task list                List tasks
  flai task current             Show current task
  flai phase current            Show current phase
  flai phase set <mode>         Set phase: startup, brainstorm, implement, review, debug
  flai phase check              Check current workflow state

Maintenance:
  flai update-user [path]       Update user preference templates
  flai self-update [path]       Update flai and user templates
  flai uninstall-user [path] -f Remove user preferences
  flai help                     Show this help

Options:
  --budget N                    Limit printed context size
  -v, --verbose                 Show changed file paths
  -f                            Force user template updates or uninstall
`;
}

export async function runCli({
  argv = process.argv,
  stdin = process.stdin,
  stdout = process.stdout,
  stderr = process.stderr,
  chooseProjectUpdates = selectProjectUpdates,
  confirmUpdate = confirmProjectUpdate,
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
    printResult(stdout, "Initialized user .flai data.", await initUser(args), { verbose: args.verbose, stderr });
    return;
  }

  if (args.command === "update-user") {
    printResult(stdout, "Updated user .flai data.", await updateUser(args), { verbose: args.verbose, stderr });
    return;
  }

  if (args.command === "self-update") {
    printResult(stdout, "Updated flai package and user .flai data.", await selfUpdate(args), { verbose: args.verbose, stderr });
    return;
  }

  if (args.command === "uninstall-user") {
    printResult(stdout, "Uninstalled user .flai data.", await uninstallUser(args), { verbose: args.verbose, stderr });
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
      if (!selectedUpdatePaths.length) {
        printResult(stdout, "No project install files updated.", { repoDir: path.resolve(args.repoDir) }, { verbose: args.verbose, stderr });
        return;
      }
      printResult(stdout, "Updated project install files.", await initProject({ ...args, selectedUpdatePaths }), {
        verbose: args.verbose,
        stderr,
      });
      return;
    }

    const result = await initProject(args);
    printResult(stdout, "Initialized project .flai data.", result, { verbose: args.verbose });
    if ((result.installSummary?.create || result.installSummary?.update) && (await confirmUpdate({ stdin, stdout, stderr }))) {
      const candidates = await listProjectUpdateCandidates(args);
      const selectedUpdatePaths = await chooseProjectUpdates(candidates, { stdin, stdout, stderr });
      if (selectedUpdatePaths?.length) {
        printResult(
          stdout,
          "Updated project install files.",
          await initProject({ ...args, update: true, selectedUpdatePaths }),
          { verbose: args.verbose, stderr },
        );
      } else {
        printResult(stdout, "No project install files updated.", { repoDir: path.resolve(args.repoDir) }, { verbose: args.verbose, stderr });
      }
    }
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
