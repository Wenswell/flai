import { Console } from "node:console";

export function printResult(stdout, label, result) {
  stdout.write(`${label}\n`);
  if (result.userFlaiDir) stdout.write(`userFlaiDir: ${result.userFlaiDir}\n`);
  if (result.repoDir) stdout.write(`repoDir: ${result.repoDir}\n`);
  if (result.packageName) stdout.write(`package: ${result.packageName}\n`);
  if (result.removed) stdout.write(`removed: ${result.removed}\n`);
  if (result.commands?.length) stdout.write(`commands:\n${result.commands.map((item) => `- ${item}`).join("\n")}\n`);
  if (result.created?.length) stdout.write(`created:\n${result.created.map((item) => `- ${item}`).join("\n")}\n`);
  if (result.updated?.length) stdout.write(`updated:\n${result.updated.map((item) => `- ${item}`).join("\n")}\n`);
  if (result.skipped?.length) stdout.write(`skipped:\n${result.skipped.map((item) => `- ${item}`).join("\n")}\n`);
  if (result.conflicts?.length) stdout.write(`conflicts:\n${result.conflicts.map((item) => `- ${item}`).join("\n")}\n`);
}

export function writeTable(stdout, stderr, rows) {
  if (typeof stdout.removeListener === "function") {
    new Console({ stdout, stderr }).table(rows);
    return;
  }

  stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
}
