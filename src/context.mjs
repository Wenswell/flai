import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const DEFAULT_MAX_CHARS = 5000;
const USER_DOCS = ["preferences.md", "workflow.md", "context-policy.md", "failure-patterns.md"];
const PROJECT_DOCS = ["project.md", "now.md", "context-policy.md", "issues.md"];

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}

async function readText(filePath, fallback = "") {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return fallback;
  }
}

function compactMarkdown(text, maxChars) {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (clean.length <= maxChars) {
    return clean;
  }

  const lines = clean.split("\n");
  const kept = [];
  let size = 0;
  for (const line of lines) {
    const nextSize = size + line.length + 1;
    if (nextSize > maxChars - 40) {
      break;
    }
    kept.push(line);
    size = nextSize;
  }
  kept.push("[trimmed]");
  return kept.join("\n");
}

function section(name, body, attrs = "") {
  const content = body.trim();
  if (!content) {
    return "";
  }
  const open = attrs ? `<${name} ${attrs}>` : `<${name}>`;
  return `${open}\n${content}\n</${name}>`;
}

function extractCurrentTaskPath(nowText) {
  const match = nowText.match(/Current task:\s*(.+)/i);
  if (!match) {
    return "";
  }
  const value = match[1].trim().replace(/^`|`$/g, "");
  if (!value || value.toLowerCase() === "none") {
    return "";
  }
  return value;
}

function resolveProjectPath(cwd, maybeRelative) {
  const normalized = maybeRelative.replace(/^["']|["']$/g, "");
  if (path.isAbsolute(normalized)) {
    return normalized;
  }
  return path.resolve(cwd, normalized);
}

async function listProjectDocs(projectAiDir) {
  if (!existsSync(projectAiDir)) {
    return "No project .flai directory found.";
  }

  const entries = await readdir(projectAiDir, { withFileTypes: true });
  const docs = entries
    .filter((entry) => {
      if (entry.name === "archive") return false;
      if (entry.name === "scripts") return false;
      return entry.isDirectory() || entry.name.endsWith(".md");
    })
    .map((entry) => `${entry.isDirectory() ? "dir " : "file"} ${normalizePath(path.join(".flai", entry.name))}`)
    .sort();

  return docs.length ? docs.join("\n") : "No project docs found.";
}

function trimContext(context, maxChars) {
  if (context.length <= maxChars) {
    return context;
  }

  const marker = "\n<context-note>Context trimmed to fit the startup budget. Read source files on demand.</context-note>\n";
  return `${context.slice(0, Math.max(0, maxChars - marker.length))}${marker}`.slice(0, maxChars);
}

async function buildUserDefaults(userFlaiDir) {
  const parts = [];
  for (const name of USER_DOCS) {
    const filePath = path.join(userFlaiDir, name);
    const text = await readText(filePath);
    if (text.trim()) {
      parts.push(`## Source: ${normalizePath(filePath)}\n${compactMarkdown(text, 900)}`);
    }
  }

  if (!parts.length) {
    return "No user-level .flai defaults found.";
  }
  return parts.join("\n\n");
}

async function buildProjectSummary(projectAiDir) {
  const projectText = await readText(path.join(projectAiDir, "project.md"));
  if (!projectText.trim()) {
    return "No .flai/project.md found.";
  }
  return `## Source: .flai/project.md\n${compactMarkdown(projectText, 1100)}`;
}

async function buildProjectPolicy(projectAiDir) {
  const policyText = await readText(path.join(projectAiDir, "context-policy.md"));
  if (!policyText.trim()) {
    return "No .flai/context-policy.md found.";
  }
  return `## Source: .flai/context-policy.md\n${compactMarkdown(policyText, 1100)}`;
}

async function buildActiveTaskStatus(cwd, nowText) {
  const taskRef = extractCurrentTaskPath(nowText);
  if (!taskRef) {
    return "";
  }

  const statusPath = resolveProjectPath(cwd, taskRef);
  const status = await readText(statusPath);
  if (!status.trim()) {
    return `Current task status file not found: ${taskRef}`;
  }

  return compactMarkdown(status, 1000);
}

export async function buildContext(options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const userFlaiDir = path.resolve(
    options.userFlaiDir ?? process.env.FLAI_USER_DIR ?? path.join(os.homedir(), ".flai"),
  );
  const projectFlaiDir = path.resolve(options.projectFlaiDir ?? path.join(cwd, ".flai"));
  const maxChars = Number(options.maxChars ?? process.env.FLAI_CONTEXT_MAX_CHARS ?? DEFAULT_MAX_CHARS);

  const nowText = await readText(path.join(projectFlaiDir, "now.md"));
  const chunks = [
    section("user-defaults", await buildUserDefaults(userFlaiDir)),
    section("project-now", nowText ? `## Source: .flai/now.md\n${compactMarkdown(nowText, 1200)}` : "No .flai/now.md found."),
    section("active-task-status", await buildActiveTaskStatus(cwd, nowText), 'source="current-task"'),
    section("project-summary", await buildProjectSummary(projectFlaiDir)),
    section("context-policy", await buildProjectPolicy(projectFlaiDir)),
    section("docs-index", await listProjectDocs(projectFlaiDir)),
    section(
      "startup-rule",
      [
        "Default to tiny or normal flow.",
        "Do not create task docs, PRDs, multi-agent plans, or review loops by default.",
        "Read plan.md only when continuing a normal/deep task. Do not read log.md by default.",
      ].join("\n"),
    ),
  ].filter(Boolean);

  return trimContext(chunks.join("\n\n"), maxChars);
}

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
    maxChars: undefined,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--client") {
      args.client = argv[index + 1] ?? "text";
      index += 1;
    } else if (value === "--max-chars") {
      args.maxChars = Number(argv[index + 1]);
      index += 1;
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
  const context = await buildContext({
    cwd: input.cwd ?? process.cwd(),
    maxChars: args.maxChars,
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

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
