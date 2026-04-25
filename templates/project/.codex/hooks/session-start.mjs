import { runCli } from "{{CONTEXT_MODULE_URL}}";

await runCli({
  argv: [process.argv[0], process.argv[1], "--client", "codex"],
  stdin: process.stdin,
  stdout: process.stdout,
});
