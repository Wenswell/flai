import { Console } from "node:console";

function printItems(stdout, name, items, verbose) {
  if (!items?.length) {
    return;
  }

  if (verbose) {
    stdout.write(`${name}:\n${items.map((item) => `- ${item}`).join("\n")}\n`);
    return;
  }

  stdout.write(`${name}: ${items.length}\n`);
}

function installSummaryRows(summary) {
  return [
    { status: "create", count: summary.create },
    { status: "update", count: summary.update },
    { status: "same", count: summary.same },
    { status: "ignored project docs", count: summary.ignored },
  ];
}

export function writeInstallSummary(stdout, stderr, summary) {
  stdout.write("install files:\n");
  writeTable(stdout, stderr, installSummaryRows(summary));
}

export function printResult(stdout, label, result, options = {}) {
  const verbose = Boolean(options.verbose);
  const stderr = options.stderr ?? stdout;
  stdout.write(`${label}\n`);
  if (result.userFlaiDir) stdout.write(`userFlaiDir: ${result.userFlaiDir}\n`);
  if (result.repoDir) stdout.write(`repoDir: ${result.repoDir}\n`);
  if (result.packageName) stdout.write(`package: ${result.packageName}\n`);
  if (result.removed) stdout.write(`removed: ${result.removed}\n`);
  if (result.installSummary) {
    writeInstallSummary(stdout, stderr, result.installSummary);
  }
  printItems(stdout, "commands", result.commands, verbose);
  printItems(stdout, "created", result.created, verbose);
  printItems(stdout, "updated", result.updated, verbose);
  printItems(stdout, "existing", result.existing, verbose);
  printItems(stdout, "skipped", result.skipped, verbose);
  printItems(stdout, "conflicts", result.conflicts, verbose);
}

export function writeTable(stdout, stderr, rows) {
  if (typeof stdout.removeListener === "function") {
    new Console({ stdout, stderr }).table(rows);
    return;
  }

  stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
}
