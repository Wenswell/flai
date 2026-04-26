import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const MODE_BUDGETS = {
  startup: 2600,
  brainstorm: 5000,
  implement: 6500,
  review: 5200,
  debug: 6500,
  task: 4200,
};

const USER_DOCS = ["preferences.md", "workflow.md", "failure-patterns.md"];
const MODES = new Set(Object.keys(MODE_BUDGETS));

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

function normalizeWhitespace(text) {
  return text.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
}

function previewText(text, maxChars = 20) {
  const clean = normalizeWhitespace(text);
  if (clean.length <= maxChars) {
    return clean;
  }
  return `${clean.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
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
    if (nextSize > maxChars - 14) {
      break;
    }
    kept.push(line);
    size = nextSize;
  }

  if (!kept.length) {
    return `${clean.slice(0, Math.max(0, maxChars - 14)).trimEnd()}\n[trimmed]`;
  }

  kept.push("[trimmed]");
  return kept.join("\n");
}

function estimateTokens(text) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return 0;
  }

  const pieces = normalized.match(/[\u3400-\u9fff]|[A-Za-z0-9_]+|[^\s]/g) ?? [];
  return pieces.reduce((total, piece) => {
    if (/^[A-Za-z0-9_]+$/.test(piece)) {
      return total + Math.ceil(piece.length / 4);
    }
    return total + 1;
  }, 0);
}

function normalizeMode(value) {
  if (!value) {
    return "startup";
  }
  if (!MODES.has(value)) {
    throw new Error(`Unknown context mode: ${value}`);
  }
  return value;
}

function normalizeBudget(options, mode) {
  const value = options.budget ?? process.env.FLAI_CONTEXT_BUDGET;
  if (value === undefined) {
    return MODE_BUDGETS[mode];
  }
  const budget = Number(value);
  if (!Number.isFinite(budget) || budget < 500) {
    throw new Error("Context budget must be a number >= 500.");
  }
  return Math.floor(budget);
}

function contextSection(source, text, options = {}) {
  return {
    source,
    type: options.type ?? "file",
    tag: options.tag ?? path.basename(source).replace(/[^A-Za-z0-9_-]/g, "-"),
    text: text.replace(/\r\n/g, "\n").trim(),
    maxChars: options.maxChars ?? 1200,
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

async function readCurrentTaskRef(projectFlaiDir, nowText) {
  const fromFile = await readText(path.join(projectFlaiDir, ".current-task"));
  if (fromFile.trim()) {
    return fromFile.trim();
  }
  return extractCurrentTaskPath(nowText);
}

function resolveProjectPath(cwd, maybeRelative) {
  const normalized = maybeRelative.replace(/^["']|["']$/g, "");
  if (path.isAbsolute(normalized)) {
    return normalized;
  }
  return path.resolve(cwd, normalized);
}

async function listProjectDocs(projectFlaiDir) {
  if (!existsSync(projectFlaiDir)) {
    return "No project .flai directory found.";
  }

  const entries = await readdir(projectFlaiDir, { withFileTypes: true });
  const docs = entries
    .filter((entry) => {
      if (entry.name === "scripts") return false;
      if (entry.name.startsWith(".backup-")) return false;
      return entry.isDirectory() || entry.name.endsWith(".md");
    })
    .map((entry) => `${entry.isDirectory() ? "dir " : "file"} ${normalizePath(path.join(".flai", entry.name))}`)
    .sort();

  return docs.length ? docs.join("\n") : "No project docs found.";
}

async function addProjectDoc(sections, projectFlaiDir, name, options = {}) {
  const text = await readText(path.join(projectFlaiDir, name));
  if (text.trim()) {
    sections.push(contextSection(normalizePath(path.join(".flai", name)), text, options));
  }
}

async function addUserDocs(sections, userFlaiDir, names, maxChars = 700) {
  for (const name of names) {
    const filePath = path.join(userFlaiDir, name);
    const text = await readText(filePath);
    if (text.trim()) {
      sections.push(contextSection(normalizePath(filePath), text, { tag: `user-${name}`, maxChars }));
    }
  }
}

async function addTaskDoc(sections, cwd, taskRef, name, options = {}) {
  if (!taskRef) {
    return;
  }

  const statusPath = resolveProjectPath(cwd, taskRef);
  const taskDir = path.dirname(statusPath);
  const filePath = name === "status.md" ? statusPath : path.join(taskDir, name);
  const text = await readText(filePath);
  if (text.trim()) {
    const source = normalizePath(path.relative(cwd, filePath));
    sections.push(contextSection(source, text, { tag: `task-${name}`, maxChars: options.maxChars ?? 1000 }));
  }
}

async function collectContextSections(options = {}) {
  const mode = normalizeMode(options.mode);
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const userFlaiDir = path.resolve(
    options.userFlaiDir ?? process.env.FLAI_USER_DIR ?? path.join(os.homedir(), ".flai"),
  );
  const projectFlaiDir = path.resolve(options.projectFlaiDir ?? path.join(cwd, ".flai"));
  const nowText = await readText(path.join(projectFlaiDir, "now.md"));
  const taskRef = await readCurrentTaskRef(projectFlaiDir, nowText);
  const sections = [];

  if (mode === "startup") {
    if (nowText.trim()) sections.push(contextSection(".flai/now.md", nowText, { tag: "project-now", maxChars: 620 }));
    await addProjectDoc(sections, projectFlaiDir, "conversation.md", { tag: "conversation", maxChars: 600 });
    await addTaskDoc(sections, cwd, taskRef, "status.md", { maxChars: 520 });
    await addProjectDoc(sections, projectFlaiDir, "project.md", { tag: "project-summary", maxChars: 620 });
    await addUserDocs(sections, userFlaiDir, USER_DOCS, 420);
    await addProjectDoc(sections, projectFlaiDir, "workflow.md", { tag: "workflow", maxChars: 620 });
  } else if (mode === "brainstorm") {
    if (nowText.trim()) sections.push(contextSection(".flai/now.md", nowText, { tag: "project-now", maxChars: 700 }));
    await addProjectDoc(sections, projectFlaiDir, "conversation.md", { tag: "conversation", maxChars: 1200 });
    await addProjectDoc(sections, projectFlaiDir, "issues.md", { tag: "issues", maxChars: 900 });
    await addTaskDoc(sections, cwd, taskRef, "status.md", { maxChars: 900 });
    await addTaskDoc(sections, cwd, taskRef, "plan.md", { maxChars: 1400 });
    await addTaskDoc(sections, cwd, taskRef, "decisions.md", { maxChars: 1000 });
    await addProjectDoc(sections, projectFlaiDir, "project.md", { tag: "project-summary", maxChars: 900 });
    await addUserDocs(sections, userFlaiDir, ["preferences.md", "workflow.md"], 450);
  } else if (mode === "implement") {
    if (nowText.trim()) sections.push(contextSection(".flai/now.md", nowText, { tag: "project-now", maxChars: 650 }));
    await addProjectDoc(sections, projectFlaiDir, "conversation.md", { tag: "conversation", maxChars: 900 });
    await addTaskDoc(sections, cwd, taskRef, "status.md", { maxChars: 900 });
    await addTaskDoc(sections, cwd, taskRef, "plan.md", { maxChars: 1300 });
    await addTaskDoc(sections, cwd, taskRef, "implement.md", { maxChars: 1600 });
    await addTaskDoc(sections, cwd, taskRef, "decisions.md", { maxChars: 900 });
    await addProjectDoc(sections, projectFlaiDir, "project.md", { tag: "project-summary", maxChars: 900 });
    await addProjectDoc(sections, projectFlaiDir, "workflow.md", { tag: "workflow", maxChars: 900 });
    await addUserDocs(sections, userFlaiDir, USER_DOCS, 420);
  } else if (mode === "review") {
    if (nowText.trim()) sections.push(contextSection(".flai/now.md", nowText, { tag: "project-now", maxChars: 600 }));
    await addProjectDoc(sections, projectFlaiDir, "conversation.md", { tag: "conversation", maxChars: 800 });
    await addTaskDoc(sections, cwd, taskRef, "status.md", { maxChars: 900 });
    await addTaskDoc(sections, cwd, taskRef, "plan.md", { maxChars: 900 });
    await addTaskDoc(sections, cwd, taskRef, "review.md", { maxChars: 1400 });
    await addTaskDoc(sections, cwd, taskRef, "decisions.md", { maxChars: 900 });
    await addProjectDoc(sections, projectFlaiDir, "issues.md", { tag: "issues", maxChars: 700 });
    await addUserDocs(sections, userFlaiDir, ["preferences.md", "workflow.md"], 420);
  } else if (mode === "debug") {
    if (nowText.trim()) sections.push(contextSection(".flai/now.md", nowText, { tag: "project-now", maxChars: 650 }));
    await addProjectDoc(sections, projectFlaiDir, "conversation.md", { tag: "conversation", maxChars: 800 });
    await addTaskDoc(sections, cwd, taskRef, "status.md", { maxChars: 900 });
    await addTaskDoc(sections, cwd, taskRef, "review.md", { maxChars: 900 });
    await addTaskDoc(sections, cwd, taskRef, "log.md", { maxChars: 1600 });
    await addTaskDoc(sections, cwd, taskRef, "decisions.md", { maxChars: 900 });
    await addProjectDoc(sections, projectFlaiDir, "issues.md", { tag: "issues", maxChars: 700 });
    await addUserDocs(sections, userFlaiDir, ["failure-patterns.md", "preferences.md", "workflow.md"], 420);
  } else if (mode === "task") {
    if (nowText.trim()) sections.push(contextSection(".flai/now.md", nowText, { tag: "project-now", maxChars: 700 }));
    await addProjectDoc(sections, projectFlaiDir, "conversation.md", { tag: "conversation", maxChars: 1000 });
    await addTaskDoc(sections, cwd, taskRef, "status.md", { maxChars: 1100 });
    await addTaskDoc(sections, cwd, taskRef, "plan.md", { maxChars: 1300 });
    await addTaskDoc(sections, cwd, taskRef, "decisions.md", { maxChars: 1000 });
  }

  sections.push(
    contextSection("project-doc-index", await listProjectDocs(projectFlaiDir), {
      type: "generated",
      tag: "docs-index",
      maxChars: mode === "startup" ? 500 : 800,
    }),
  );

  sections.push(
    contextSection(
      "mode-rule",
      [
        `Context mode: ${mode}.`,
        "User-facing workflow stays conversational.",
        "Use tiny for clear low-risk changes.",
        "Use normal or deep only when scope, risk, or uncertainty justifies task files.",
        "Read more files on demand instead of assuming omitted context.",
      ].join("\n"),
      { type: "generated", tag: "mode-rule", maxChars: 520 },
    ),
  );

  return sections.filter((section) => section.text.trim());
}

function renderSection(section, text) {
  return `<${section.tag} source="${section.source}">\n${text}\n</${section.tag}>`;
}

function analyzeSections(sections, options = {}) {
  const mode = normalizeMode(options.mode);
  const budget = normalizeBudget(options, mode);
  const close = "\n</flai-context>\n";
  const chunks = [`<flai-context mode="${mode}" budget="${budget}">`];
  const rows = [];

  for (const section of sections) {
    const currentLength = chunks.join("\n\n").length + close.length;
    const remaining = budget - currentLength;
    const wrapperOverhead = renderSection(section, "").length + 2;
    const allowed = Math.min(section.maxChars, remaining - wrapperOverhead);

    if (allowed < 80) {
      rows.push({ section, state: "omitted", renderedText: "" });
      continue;
    }

    const renderedText = compactMarkdown(section.text, allowed);
    const state = renderedText.length < section.text.length ? "trimmed" : "used";
    chunks.push(renderSection(section, renderedText));
    rows.push({ section, state, renderedText });
  }

  chunks.push("</flai-context>");

  return {
    mode,
    budget,
    text: chunks.join("\n\n"),
    rows: rows.map(({ section, state, renderedText }) => ({
      source: section.source,
      type: section.type,
      chars: section.text.length,
      tokens: estimateTokens(section.text),
      state,
      preview: previewText(section.text),
      renderedChars: renderedText.length,
    })),
  };
}

export async function buildContextAnalysis(options = {}) {
  const mode = normalizeMode(options.mode);
  const sections = await collectContextSections({ ...options, mode });
  return analyzeSections(sections, { ...options, mode });
}

export async function buildContext(options = {}) {
  return (await buildContextAnalysis(options)).text;
}

export async function buildContextSources(options = {}) {
  return (await buildContextAnalysis(options)).rows;
}

export async function buildContextReport(options = {}) {
  const analysis = await buildContextAnalysis(options);
  const lines = [
    "# .flai context sources",
    "",
    `mode: ${analysis.mode}`,
    `budget: ${analysis.budget}`,
    `chars: ${analysis.text.length}`,
    "",
    "| source | type | chars | tokens | state | preview |",
    "|---|---|---:|---:|---|---|",
  ];

  for (const row of analysis.rows) {
    lines.push(`| ${row.source} | ${row.type} | ${row.chars} | ${row.tokens} | ${row.state} | ${row.preview} |`);
  }

  return lines.join("\n");
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
    mode: "startup",
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
  const context = await buildContext({
    cwd: input.cwd ?? process.cwd(),
    mode: args.mode,
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

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
