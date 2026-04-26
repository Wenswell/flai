import { mkdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import process from "node:process";

import { listFilesRecursive, normalize, renderTemplate, writeIfMissing } from "../lib/common.mjs";

export async function initProject(options = {}) {
  const repoDir = normalize(options.repoDir ?? process.cwd());
  const result = { created: [], skipped: [], repoDir };
  const force = Boolean(options.force);
  const projectTemplateDir = path.join(options.templatesDir, "project");
  const values = {
    projectName: path.basename(repoDir),
    date: new Date().toISOString().slice(0, 10),
    contextModuleUrl: pathToFileURL(path.join(options.scriptDir, "context.mjs")).href,
  };

  for (const relativePath of await listFilesRecursive(projectTemplateDir)) {
    const content = await readFile(path.join(projectTemplateDir, relativePath), "utf8");
    await writeIfMissing(path.join(repoDir, relativePath), renderTemplate(content, values), result, force);
  }

  await mkdir(path.join(repoDir, ".flai", "tasks"), { recursive: true });

  return result;
}
