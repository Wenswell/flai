import process from "node:process";

import { buildContext } from "./api.mjs";
import { checkPhase, getCurrentPhase, setCurrentPhase } from "../commands/phase.mjs";

const AGENT_PHASES = {
  brainstorm: "brainstorm",
  plan: "brainstorm",
  implement: "implement",
  review: "review",
  check: "review",
  debug: "debug",
};

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
    event: "session-start",
    mode: undefined,
    budget: undefined,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--client") {
      args.client = argv[index + 1] ?? "text";
      index += 1;
    } else if (value === "--event") {
      args.event = argv[index + 1] ?? "session-start";
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

function workflowGate(phaseCheck, contextLength) {
  return `<workflow-gate>
Status: ${phaseCheck.status}
Active phase: ${phaseCheck.phase}
Current task: ${phaseCheck.currentTask || "none"}
Phase policy: .flai/policy/${phaseCheck.phase}.md
Next command: ${phaseCheck.nextCommand}
Injected context: ${contextLength} chars
Rule: resolve STALE_POINTER, NO_TASK, or NOT_READY before development unless the user explicitly overrides it.
Rule: before writing or reviewing code, use the active phase context and follow the injected phase-policy section.
</workflow-gate>`;
}

function buildSessionContext(context, phaseCheck) {
  return `${workflowGate(phaseCheck, context.length)}\n\n${context}`;
}

function phaseForToolInput(input) {
  const toolName = input.tool_name ?? "";
  if (!["Task", "Agent"].includes(toolName)) {
    return "";
  }

  const toolInput = input.tool_input ?? {};
  const subagent = String(toolInput.subagent_type ?? toolInput.agent_type ?? "").toLowerCase();
  return AGENT_PHASES[subagent] ?? "";
}

function promptWithContext({ phase, phaseCheck, context, prompt }) {
  return `# Flai ${phase} Context

The workflow context below has been injected automatically before this agent runs.
Follow it as the active source of truth.

${workflowGate(phaseCheck, context.length)}

${context}

---

${prompt}`;
}

async function runPreToolUse({ input, cwd, args, stdout }) {
  const phase = args.mode || phaseForToolInput(input);
  if (!phase) {
    return;
  }

  await setCurrentPhase({ repoDir: cwd, phase });
  const phaseCheck = await checkPhase({ repoDir: cwd, phase });
  const context = await buildContext({ cwd, mode: phase, budget: args.budget });
  const toolInput = input.tool_input ?? {};
  const prompt = String(toolInput.prompt ?? "");

  stdout.write(
    `${JSON.stringify(
      {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
          updatedInput: {
            ...toolInput,
            prompt: promptWithContext({ phase, phaseCheck, context, prompt }),
          },
        },
      },
      null,
      0,
    )}\n`,
  );
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
  if (args.event === "pre-tool-use") {
    await runPreToolUse({ input, cwd, args, stdout });
    return;
  }

  const mode = args.mode || (await getCurrentPhase({ repoDir: cwd }));
  const phaseCheck = await checkPhase({ repoDir: cwd, phase: mode });
  const context = await buildContext({
    cwd,
    mode,
    budget: args.budget,
  });
  const sessionContext = buildSessionContext(context, phaseCheck);

  if (args.client === "codex" || args.client === "claude") {
    stdout.write(
      `${JSON.stringify(
        {
          suppressOutput: true,
          systemMessage: `.flai context injected (${sessionContext.length} chars, ${phaseCheck.phase}, ${phaseCheck.status})`,
          hookSpecificOutput: {
            hookEventName: "SessionStart",
            additionalContext: sessionContext,
          },
        },
        null,
        0,
      )}\n`,
    );
    return;
  }

  stdout.write(`${sessionContext}\n`);
}
