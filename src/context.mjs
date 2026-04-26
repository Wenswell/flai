import process from "node:process";

export { buildContext, buildContextAnalysis } from "./context/api.mjs";
export { runCli } from "./context/hook.mjs";

import { runCli } from "./context/hook.mjs";
import { isMainModule } from "./lib/common.mjs";

if (isMainModule(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
