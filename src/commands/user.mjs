import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

import { listFilesRecursive, normalize, readJson, sha256, writeIfMissing } from "../lib/common.mjs";

const USER_MANIFEST = ".manifest.json";
const execFileAsync = promisify(execFile);

async function readUserTemplates({ templatesDir }) {
  const userTemplateDir = path.join(templatesDir, "user");
  const templates = [];
  for (const name of await listFilesRecursive(userTemplateDir)) {
    const content = await readFile(path.join(userTemplateDir, name), "utf8");
    templates.push({ name, content, sha256: sha256(content) });
  }
  return templates;
}

async function writeUserManifest(userFlaiDir, files, { packageJson }) {
  await writeFile(
    path.join(userFlaiDir, USER_MANIFEST),
    `${JSON.stringify(
      {
        package: packageJson.name,
        version: packageJson.version,
        updatedAt: new Date().toISOString(),
        files,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

export async function initUser(options = {}) {
  const userFlaiDir = normalize(options.userFlaiDir ?? path.join(os.homedir(), ".flai"));
  const result = { created: [], skipped: [], userFlaiDir };
  const manifestFiles = {};

  for (const template of await readUserTemplates(options)) {
    const target = path.join(userFlaiDir, template.name);
    await writeIfMissing(target, template.content, result, Boolean(options.force));
    if (Boolean(options.force) || !existsSync(target) || (await readFile(target, "utf8")) === template.content) {
      manifestFiles[template.name] = { sha256: template.sha256 };
    }
  }

  await mkdir(userFlaiDir, { recursive: true });
  await writeUserManifest(userFlaiDir, manifestFiles, options);
  return result;
}

export async function updateUser(options = {}) {
  const userFlaiDir = normalize(options.userFlaiDir ?? path.join(os.homedir(), ".flai"));
  const result = { created: [], updated: [], skipped: [], conflicts: [], userFlaiDir };
  const previous = await readJson(path.join(userFlaiDir, USER_MANIFEST), { files: {} });
  const manifestFiles = {};

  await mkdir(userFlaiDir, { recursive: true });

  for (const template of await readUserTemplates(options)) {
    const target = path.join(userFlaiDir, template.name);
    const previousHash = previous.files?.[template.name]?.sha256;

    if (!existsSync(target)) {
      await writeFile(target, template.content, "utf8");
      result.created.push(target);
      manifestFiles[template.name] = { sha256: template.sha256 };
      continue;
    }

    const current = await readFile(target, "utf8");
    const currentHash = sha256(current);

    if (options.force || (previousHash && currentHash === previousHash)) {
      if (current !== template.content) {
        await writeFile(target, template.content, "utf8");
        result.updated.push(target);
      } else {
        result.skipped.push(target);
      }
      manifestFiles[template.name] = { sha256: template.sha256 };
      continue;
    }

    if (currentHash === template.sha256) {
      result.skipped.push(target);
      manifestFiles[template.name] = { sha256: template.sha256 };
      continue;
    }

    result.conflicts.push(target);
  }

  await writeUserManifest(userFlaiDir, manifestFiles, options);
  return result;
}

async function defaultRunCommand(command, args) {
  await execFileAsync(command, args, { windowsHide: true });
}

export async function selfUpdate(options = {}) {
  const userFlaiDir = normalize(options.userFlaiDir ?? path.join(os.homedir(), ".flai"));
  const runCommand = options.runCommand ?? defaultRunCommand;
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const flaiCommand = process.env.FLAI_BIN || "flai";
  const npmArgs = ["install", "-g", `${options.packageJson.name}@latest`];
  const updateUserArgs = ["update-user", userFlaiDir];
  const result = { packageName: options.packageJson.name, userFlaiDir, commands: [] };

  if (options.force) {
    updateUserArgs.push("-f");
  }

  await runCommand(npmCommand, npmArgs);
  result.commands.push([npmCommand, ...npmArgs].join(" "));

  await runCommand(flaiCommand, updateUserArgs);
  result.commands.push([flaiCommand, ...updateUserArgs].join(" "));

  return result;
}

export async function uninstallUser(options = {}) {
  const userFlaiDir = normalize(options.userFlaiDir ?? path.join(os.homedir(), ".flai"));
  if (!options.confirm) {
    throw new Error("Refusing to uninstall user data without -f.");
  }

  await rm(userFlaiDir, { recursive: true, force: true });
  return { removed: userFlaiDir };
}
