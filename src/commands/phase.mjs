import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { normalizeMode } from "../context/config.mjs";
import { getCurrentTask } from "./task.mjs";
import { normalize, readText } from "../lib/common.mjs";

const PHASE_FILE = ".phase";

export async function getCurrentPhase(options = {}) {
  const repoDir = normalize(options.repoDir ?? process.cwd());
  const phase = (await readText(path.join(repoDir, ".flai", PHASE_FILE))).trim();
  return normalizeMode(phase || "startup");
}

export async function setCurrentPhase(options = {}) {
  const repoDir = normalize(options.repoDir ?? process.cwd());
  const phase = normalizeMode(options.phase);
  const flaiDir = path.join(repoDir, ".flai");
  await mkdir(flaiDir, { recursive: true });
  await writeFile(path.join(flaiDir, PHASE_FILE), `${phase}\n`, "utf8");
  return { phase };
}

function isEmptyTaskDoc(text) {
  const clean = text.replace(/\r\n/g, "\n").trim();
  return !clean || /- None yet\.\s*$/i.test(clean);
}

async function currentTaskDir(repoDir) {
  const current = await getCurrentTask({ repoDir });
  if (!current) {
    return { current: "", taskDir: "", statusPath: "" };
  }
  const statusPath = path.isAbsolute(current) ? current : path.resolve(repoDir, current);
  if (!existsSync(statusPath)) {
    return { current, taskDir: "", statusPath };
  }
  return { current, taskDir: path.dirname(statusPath), statusPath };
}

function nextCommandFor(status, phase) {
  if (status === "STALE_POINTER") return "flai task finish";
  if (status === "NO_TASK") return "flai task create \"title\"";
  if (status === "NOT_READY") return `flai context ${phase} --sources`;
  return `flai context ${phase}`;
}

export async function checkPhase(options = {}) {
  const repoDir = normalize(options.repoDir ?? process.cwd());
  const phase = normalizeMode(options.phase ?? (await getCurrentPhase({ repoDir })));
  const issues = [];
  const task = await currentTaskDir(repoDir);
  let status = "READY";

  if (task.current && !task.taskDir) {
    status = "STALE_POINTER";
    issues.push(`Current task points to a missing file: ${task.current}`);
  }

  if (["implement", "review", "debug", "task"].includes(phase) && !task.current) {
    status = "NO_TASK";
    issues.push(`${phase} phase needs a current task.`);
  }

  if (task.taskDir) {
    const statusText = await readText(path.join(task.taskDir, "status.md"));
    if (!statusText.trim()) {
      issues.push("Current task is missing status.md content.");
    }

    if (phase === "implement") {
      const implementText = await readText(path.join(task.taskDir, "implement.md"));
      if (isEmptyTaskDoc(implementText)) {
        issues.push("implement phase should have implement.md context.");
      }
    }

    if (phase === "review") {
      const reviewText = await readText(path.join(task.taskDir, "review.md"));
      if (isEmptyTaskDoc(reviewText)) {
        issues.push("review phase should have review.md checks.");
      }
    }

    if (phase === "debug") {
      const logExists = existsSync(path.join(task.taskDir, "log.md"));
      if (!logExists) {
        issues.push("debug phase should have log.md or recorded failure facts.");
      }
    }
  }

  if (issues.length && status === "READY") {
    status = "NOT_READY";
  }

  return {
    ok: issues.length === 0,
    phase,
    status,
    currentTask: task.current,
    nextCommand: nextCommandFor(status, phase),
    issues,
  };
}
