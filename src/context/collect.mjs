import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { normalizeMode, SOURCE_BUDGET, USER_DOCS } from "./config.mjs";
import { checkPhase } from "../commands/phase.mjs";
import { normalizePath, readText } from "../lib/common.mjs";

const B = SOURCE_BUDGET;

function contextSection(source, text, options = {}) {
  return {
    source,
    type: options.type ?? "file",
    tag: options.tag ?? path.basename(source).replace(/[^A-Za-z0-9_-]/g, "-"),
    text: text.replace(/\r\n/g, "\n").trim(),
    maxChars: options.maxChars ?? B.medium,
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

async function addUserDocs(sections, userFlaiDir, names, maxChars = B.small) {
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
    sections.push(contextSection(source, text, { tag: `task-${name}`, maxChars: options.maxChars ?? B.medium }));
  }
}

async function addPhasePolicy(sections, projectFlaiDir, mode) {
  const text = await readText(path.join(projectFlaiDir, "policy", `${mode}.md`));
  if (text.trim()) {
    sections.push(
      contextSection(normalizePath(path.join(".flai", "policy", `${mode}.md`)), text, {
        tag: "phase-policy",
        maxChars: B.medium,
      }),
    );
  }
}

function workflowStateSection(phaseCheck) {
  const lines = [
    `Status: ${phaseCheck.status}.`,
    `Active phase: ${phaseCheck.phase}.`,
    `Current task: ${phaseCheck.currentTask || "none"}.`,
    phaseCheck.issues.length ? "Issues:" : "Issues: none.",
    ...phaseCheck.issues.map((issue) => `- ${issue}`),
    `Next command: ${phaseCheck.nextCommand}.`,
  ];

  if (["startup", "brainstorm"].includes(phaseCheck.phase)) {
    lines.push("Sync target: .flai/conversation.md for goal, conclusions, open questions, and next step.");
  }

  lines.push("Rule: resolve non-READY status before continuing unless the user overrides it.");
  lines.push("Rule: before executing any task, command, file edit, or commit, state the action scope and wait for explicit user confirmation.");
  lines.push("Rule: read-only context inspection is allowed before confirmation.");

  return contextSection(
    "workflow-state",
    lines.join("\n"),
    { type: "generated", tag: "workflow-state", maxChars: B.medium },
  );
}

export async function collectContextSections(options = {}) {
  const mode = normalizeMode(options.mode);
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const userFlaiDir = path.resolve(
    options.userFlaiDir ?? process.env.FLAI_USER_DIR ?? path.join(os.homedir(), ".flai"),
  );
  const projectFlaiDir = path.resolve(options.projectFlaiDir ?? path.join(cwd, ".flai"));
  const nowText = await readText(path.join(projectFlaiDir, "now.md"));
  const taskRef = await readCurrentTaskRef(projectFlaiDir, nowText);
  const phaseCheck = await checkPhase({ repoDir: cwd, phase: mode });
  const sections = [workflowStateSection(phaseCheck)];

  if (mode === "startup") {
    await addPhasePolicy(sections, projectFlaiDir, mode);
    if (nowText.trim()) sections.push(contextSection(".flai/now.md", nowText, { tag: "project-now", maxChars: B.small }));
    await addProjectDoc(sections, projectFlaiDir, "conversation.md", { tag: "conversation", maxChars: B.small });
    await addTaskDoc(sections, cwd, taskRef, "status.md", { maxChars: B.small });
    await addProjectDoc(sections, projectFlaiDir, "project.md", { tag: "project-summary", maxChars: B.small });
    await addUserDocs(sections, userFlaiDir, USER_DOCS, B.small);
  } else if (mode === "brainstorm") {
    await addPhasePolicy(sections, projectFlaiDir, mode);
    if (nowText.trim()) sections.push(contextSection(".flai/now.md", nowText, { tag: "project-now", maxChars: B.medium }));
    await addProjectDoc(sections, projectFlaiDir, "conversation.md", { tag: "conversation", maxChars: B.large });
    await addProjectDoc(sections, projectFlaiDir, "issues.md", { tag: "issues", maxChars: B.medium });
    await addTaskDoc(sections, cwd, taskRef, "status.md", { maxChars: B.medium });
    await addTaskDoc(sections, cwd, taskRef, "plan.md", { maxChars: B.large });
    await addTaskDoc(sections, cwd, taskRef, "decisions.md", { maxChars: B.medium });
    await addProjectDoc(sections, projectFlaiDir, "project.md", { tag: "project-summary", maxChars: B.medium });
    await addUserDocs(sections, userFlaiDir, ["preferences.md"], B.small);
  } else if (mode === "implement") {
    await addPhasePolicy(sections, projectFlaiDir, mode);
    if (nowText.trim()) sections.push(contextSection(".flai/now.md", nowText, { tag: "project-now", maxChars: B.medium }));
    await addTaskDoc(sections, cwd, taskRef, "status.md", { maxChars: B.medium });
    await addTaskDoc(sections, cwd, taskRef, "plan.md", { maxChars: B.large });
    await addTaskDoc(sections, cwd, taskRef, "implement.md", { maxChars: B.large });
    await addTaskDoc(sections, cwd, taskRef, "decisions.md", { maxChars: B.medium });
    await addProjectDoc(sections, projectFlaiDir, "project.md", { tag: "project-summary", maxChars: B.medium });
    await addUserDocs(sections, userFlaiDir, USER_DOCS, B.small);
  } else if (mode === "review") {
    await addPhasePolicy(sections, projectFlaiDir, mode);
    if (nowText.trim()) sections.push(contextSection(".flai/now.md", nowText, { tag: "project-now", maxChars: B.medium }));
    await addTaskDoc(sections, cwd, taskRef, "status.md", { maxChars: B.medium });
    await addTaskDoc(sections, cwd, taskRef, "plan.md", { maxChars: B.medium });
    await addTaskDoc(sections, cwd, taskRef, "review.md", { maxChars: B.large });
    await addTaskDoc(sections, cwd, taskRef, "decisions.md", { maxChars: B.medium });
    await addProjectDoc(sections, projectFlaiDir, "issues.md", { tag: "issues", maxChars: B.medium });
    await addUserDocs(sections, userFlaiDir, ["preferences.md"], B.small);
  } else if (mode === "debug") {
    await addPhasePolicy(sections, projectFlaiDir, mode);
    if (nowText.trim()) sections.push(contextSection(".flai/now.md", nowText, { tag: "project-now", maxChars: B.medium }));
    await addTaskDoc(sections, cwd, taskRef, "status.md", { maxChars: B.medium });
    await addTaskDoc(sections, cwd, taskRef, "review.md", { maxChars: B.medium });
    await addTaskDoc(sections, cwd, taskRef, "log.md", { maxChars: B.large });
    await addTaskDoc(sections, cwd, taskRef, "decisions.md", { maxChars: B.medium });
    await addProjectDoc(sections, projectFlaiDir, "issues.md", { tag: "issues", maxChars: B.medium });
    await addUserDocs(sections, userFlaiDir, ["failure-patterns.md", "preferences.md"], B.small);
  }

  sections.push(
    contextSection("project-doc-index", await listProjectDocs(projectFlaiDir), {
      type: "generated",
      tag: "docs-index",
      maxChars: mode === "startup" ? B.small : B.medium,
    }),
  );

  return sections.filter((section) => section.text.trim());
}
