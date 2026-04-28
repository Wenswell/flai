import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import process from "node:process";

import { listFilesRecursive, normalize, normalizePath, renderTemplate, writeIfMissing } from "../lib/common.mjs";

function projectValues(repoDir, options) {
  return {
    projectName: path.basename(repoDir),
    date: new Date().toISOString().slice(0, 10),
    contextModuleUrl: pathToFileURL(path.join(options.scriptDir, "context.mjs")).href,
  };
}

function isProjectInstallFile(relativePath) {
  const normalized = normalizePath(relativePath);
  return normalized.startsWith(".codex/") || normalized.startsWith(".claude/");
}

async function collectProjectTemplates({ repoDir, options, installOnly = false }) {
  const projectTemplateDir = path.join(options.templatesDir, "project");
  const skillsTemplateDir = path.join(options.templatesDir, "skills");
  const values = projectValues(repoDir, options);
  const templates = [];

  for (const relativePath of await listFilesRecursive(projectTemplateDir)) {
    const normalized = normalizePath(relativePath);
    if (installOnly && !isProjectInstallFile(normalized)) {
      continue;
    }

    const content = renderTemplate(await readFile(path.join(projectTemplateDir, relativePath), "utf8"), values);
    templates.push({ relativePath: normalized, content });
  }

  for (const relativePath of await listFilesRecursive(skillsTemplateDir)) {
    const content = renderTemplate(await readFile(path.join(skillsTemplateDir, relativePath), "utf8"), values);
    for (const client of [".codex", ".claude"]) {
      templates.push({ relativePath: normalizePath(path.join(client, "skills", relativePath)), content });
    }
  }

  return templates.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export async function countIgnoredProjectTemplates(options = {}) {
  const repoDir = normalize(options.repoDir ?? process.cwd());
  const templates = await collectProjectTemplates({ repoDir, options });
  return templates.filter((template) => !isProjectInstallFile(template.relativePath)).length;
}

export async function listProjectUpdateCandidates(options = {}) {
  const repoDir = normalize(options.repoDir ?? process.cwd());
  const templates = await collectProjectTemplates({ repoDir, options, installOnly: true });
  const candidates = [];

  for (const template of templates) {
    const target = path.join(repoDir, template.relativePath);
    if (!existsSync(target)) {
      candidates.push({ ...template, target: normalize(target), action: "create" });
      continue;
    }

    const current = await readFile(target, "utf8");
    candidates.push({
      ...template,
      target: normalize(target),
      action: current === template.content ? "same" : "update",
    });
  }

  candidates.summary = {
    create: candidates.filter((candidate) => candidate.action === "create").length,
    update: candidates.filter((candidate) => candidate.action === "update").length,
    same: candidates.filter((candidate) => candidate.action === "same").length,
    ignored: await countIgnoredProjectTemplates({ ...options, repoDir }),
  };

  return candidates;
}

export async function initProject(options = {}) {
  const repoDir = normalize(options.repoDir ?? process.cwd());
  const result = { created: [], updated: [], existing: [], skipped: [], repoDir };

  if (options.update) {
    const selected = new Set((options.selectedUpdatePaths ?? []).map(normalizePath));
    for (const candidate of await listProjectUpdateCandidates({ ...options, repoDir })) {
      if (!selected.has(candidate.relativePath)) {
        continue;
      }

      if (candidate.action === "same") {
        result.skipped.push(candidate.target);
        continue;
      }

      await mkdir(path.dirname(candidate.target), { recursive: true });
      await writeFile(candidate.target, candidate.content, "utf8");
      if (candidate.action === "create") {
        result.created.push(candidate.target);
      } else {
        result.updated.push(candidate.target);
      }
    }
    return result;
  }

  for (const template of await collectProjectTemplates({ repoDir, options })) {
    const target = path.join(repoDir, template.relativePath);
    const beforeCreated = result.created.length;
    await writeIfMissing(target, template.content, result, false);
    if (result.created.length === beforeCreated) {
      result.existing.push(result.skipped.pop());
    }
  }

  await mkdir(path.join(repoDir, ".flai", "tasks"), { recursive: true });
  result.installSummary = (await listProjectUpdateCandidates({ ...options, repoDir })).summary;

  return result;
}
