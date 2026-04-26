import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { normalizeMode, USER_DOCS } from "./config.mjs";
import { checkPhase } from "../commands/phase.mjs";
import { normalizePath, readText } from "../lib/common.mjs";

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

async function addPhasePolicy(sections, projectFlaiDir, mode) {
  const text = await readText(path.join(projectFlaiDir, "policy", `${mode}.md`));
  if (text.trim()) {
    sections.push(
      contextSection(normalizePath(path.join(".flai", "policy", `${mode}.md`)), text, {
        tag: "phase-policy",
        maxChars: 800,
      }),
    );
  }
}

function workflowStateSection(phaseCheck) {
  return contextSection(
    "workflow-state",
    [
      `Status: ${phaseCheck.status}.`,
      `Active phase: ${phaseCheck.phase}.`,
      `Current task: ${phaseCheck.currentTask || "none"}.`,
      phaseCheck.issues.length ? "Issues:" : "Issues: none.",
      ...phaseCheck.issues.map((issue) => `- ${issue}`),
      `Next command: ${phaseCheck.nextCommand}.`,
      "Rule: do not continue normal/deep work while status is NOT_READY or STALE_POINTER unless the user explicitly overrides it.",
    ].join("\n"),
    { type: "generated", tag: "workflow-state", maxChars: 900 },
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
    if (nowText.trim()) sections.push(contextSection(".flai/now.md", nowText, { tag: "project-now", maxChars: 620 }));
    await addProjectDoc(sections, projectFlaiDir, "conversation.md", { tag: "conversation", maxChars: 600 });
    await addTaskDoc(sections, cwd, taskRef, "status.md", { maxChars: 520 });
    await addProjectDoc(sections, projectFlaiDir, "project.md", { tag: "project-summary", maxChars: 620 });
    await addUserDocs(sections, userFlaiDir, USER_DOCS, 420);
  } else if (mode === "brainstorm") {
    await addPhasePolicy(sections, projectFlaiDir, mode);
    if (nowText.trim()) sections.push(contextSection(".flai/now.md", nowText, { tag: "project-now", maxChars: 700 }));
    await addProjectDoc(sections, projectFlaiDir, "conversation.md", { tag: "conversation", maxChars: 1200 });
    await addProjectDoc(sections, projectFlaiDir, "issues.md", { tag: "issues", maxChars: 900 });
    await addTaskDoc(sections, cwd, taskRef, "status.md", { maxChars: 900 });
    await addTaskDoc(sections, cwd, taskRef, "plan.md", { maxChars: 1400 });
    await addTaskDoc(sections, cwd, taskRef, "decisions.md", { maxChars: 1000 });
    await addProjectDoc(sections, projectFlaiDir, "project.md", { tag: "project-summary", maxChars: 900 });
    await addUserDocs(sections, userFlaiDir, ["preferences.md"], 450);
  } else if (mode === "implement") {
    await addPhasePolicy(sections, projectFlaiDir, mode);
    if (nowText.trim()) sections.push(contextSection(".flai/now.md", nowText, { tag: "project-now", maxChars: 650 }));
    await addProjectDoc(sections, projectFlaiDir, "conversation.md", { tag: "conversation", maxChars: 900 });
    await addTaskDoc(sections, cwd, taskRef, "status.md", { maxChars: 900 });
    await addTaskDoc(sections, cwd, taskRef, "plan.md", { maxChars: 1300 });
    await addTaskDoc(sections, cwd, taskRef, "implement.md", { maxChars: 1600 });
    await addTaskDoc(sections, cwd, taskRef, "decisions.md", { maxChars: 900 });
    await addProjectDoc(sections, projectFlaiDir, "project.md", { tag: "project-summary", maxChars: 900 });
    await addUserDocs(sections, userFlaiDir, USER_DOCS, 420);
  } else if (mode === "review") {
    await addPhasePolicy(sections, projectFlaiDir, mode);
    if (nowText.trim()) sections.push(contextSection(".flai/now.md", nowText, { tag: "project-now", maxChars: 600 }));
    await addProjectDoc(sections, projectFlaiDir, "conversation.md", { tag: "conversation", maxChars: 800 });
    await addTaskDoc(sections, cwd, taskRef, "status.md", { maxChars: 900 });
    await addTaskDoc(sections, cwd, taskRef, "plan.md", { maxChars: 900 });
    await addTaskDoc(sections, cwd, taskRef, "review.md", { maxChars: 1400 });
    await addTaskDoc(sections, cwd, taskRef, "decisions.md", { maxChars: 900 });
    await addProjectDoc(sections, projectFlaiDir, "issues.md", { tag: "issues", maxChars: 700 });
    await addUserDocs(sections, userFlaiDir, ["preferences.md"], 420);
  } else if (mode === "debug") {
    await addPhasePolicy(sections, projectFlaiDir, mode);
    if (nowText.trim()) sections.push(contextSection(".flai/now.md", nowText, { tag: "project-now", maxChars: 650 }));
    await addProjectDoc(sections, projectFlaiDir, "conversation.md", { tag: "conversation", maxChars: 800 });
    await addTaskDoc(sections, cwd, taskRef, "status.md", { maxChars: 900 });
    await addTaskDoc(sections, cwd, taskRef, "review.md", { maxChars: 900 });
    await addTaskDoc(sections, cwd, taskRef, "log.md", { maxChars: 1600 });
    await addTaskDoc(sections, cwd, taskRef, "decisions.md", { maxChars: 900 });
    await addProjectDoc(sections, projectFlaiDir, "issues.md", { tag: "issues", maxChars: 700 });
    await addUserDocs(sections, userFlaiDir, ["failure-patterns.md", "preferences.md"], 420);
  } else if (mode === "task") {
    await addPhasePolicy(sections, projectFlaiDir, mode);
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

  return sections.filter((section) => section.text.trim());
}
