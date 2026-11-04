import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { projectRoot, outputDirectory } from "../lib/build-paths.mjs";
import { prepareData } from "./prepare-data.mjs";

try {
  await prepareData({ mode: "fast", reuse: true });
  await fs.rm(outputDirectory(), { recursive: true, force: true });
  const child = spawn(process.execPath, [
    path.join(projectRoot, "node_modules/@11ty/eleventy/cmd.cjs"),
    "--serve", "--port=4173", "--quiet"
  ], { cwd: projectRoot, stdio: "inherit" });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => child.kill(signal));
  }
  child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
  child.on("exit", (code, signal) => { process.exitCode = code ?? (signal === "SIGINT" ? 0 : 1); });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
