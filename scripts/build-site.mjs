import fs from "node:fs/promises";
import Eleventy from "@11ty/eleventy";
import { outputDirectory } from "../lib/build-paths.mjs";
import { prepareData } from "./prepare-data.mjs";

try {
  const output = outputDirectory();
  await prepareData({ mode: process.argv.includes("--fast") || process.env.SKIP_HISTORY === "1" ? "fast" : "full" });
  await fs.rm(output, { recursive: true, force: true });
  const site = new Eleventy("src", output, { configPath: "eleventy.config.js", quietMode: true });
  await site.write();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
