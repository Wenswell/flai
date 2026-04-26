import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

export function normalize(value) {
  return path.resolve(value);
}

export function normalizePath(value) {
  return value.replace(/\\/g, "/");
}

export function isMainModule(metaUrl) {
  if (!process.argv[1]) {
    return false;
  }

  try {
    return realpathSync.native(fileURLToPath(metaUrl)) === realpathSync.native(path.resolve(process.argv[1]));
  } catch {
    return fileURLToPath(metaUrl) === path.resolve(process.argv[1]);
  }
}

export async function readText(filePath, fallback = "") {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return fallback;
  }
}

export async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

export function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

export async function listFilesRecursive(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(fullPath, base)));
    } else if (entry.isFile()) {
      files.push(path.relative(base, fullPath));
    }
  }
  return files.sort();
}

export function renderTemplate(text, values) {
  return text
    .replaceAll("{{PROJECT_NAME}}", values.projectName ?? "")
    .replaceAll("{{DATE}}", values.date ?? "")
    .replaceAll("{{CONTEXT_MODULE_URL}}", values.contextModuleUrl ?? "");
}

export async function writeIfMissing(filePath, content, result, force = false) {
  const target = normalize(filePath);
  await mkdir(path.dirname(target), { recursive: true });

  if (existsSync(target) && !force) {
    result.skipped.push(target);
    return;
  }

  await writeFile(target, content, "utf8");
  result.created.push(target);
}
