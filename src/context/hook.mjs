import process from "node:process";

import { buildContext } from "./api.mjs";
import { getCurrentPhase } from "../commands/phase.mjs";

function parseHookInput(raw) {
  if (!raw.trim()) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function parseArgs(argv) {
  const args = {
    client: "text",
    mode: undefined,
    budget: undefined,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--client") {
      args.client = argv[index + 1] ?? "text";
      index += 1;
    } else if (value === "--budget") {
      args.budget = Number(argv[index + 1]);
      index += 1;
    } else if (!value.startsWith("-")) {
      args.mode = value;
    }
  }

  return args;
}

export async function runCli({ argv = process.argv, stdin = process.stdin, stdout = process.stdout } = {}) {
  const args = parseArgs(argv);
  const raw = await new Promise((resolve) => {
    let data = "";
    stdin.setEncoding("utf8");
    stdin.on("data", (chunk) => {
      data += chunk;
    });
    stdin.on("end", () => resolve(data));
    if (stdin.isTTY) {
      resolve("");
    }
  });

  const input = parseHookInput(raw);
  const cwd = input.cwd ?? process.cwd();
  const context = await buildContext({
    cwd,
    mode: args.mode || (await getCurrentPhase({ repoDir: cwd })),
    budget: args.budget,
  });

  if (args.client === "codex" || args.client === "claude") {
    stdout.write(
      `${JSON.stringify(
        {
          suppressOutput: true,
          systemMessage: `.flai context injected (${context.length} chars)`,
          hookSpecificOutput: {
            hookEventName: "SessionStart",
            additionalContext: context,
          },
        },
        null,
        0,
      )}\n`,
    );
    return;
  }

  stdout.write(`${context}\n`);
}
