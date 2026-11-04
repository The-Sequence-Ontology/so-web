import fs from "node:fs/promises";
import { settings } from "../../lib/build-paths.mjs";

export default async function () {
  try {
    return JSON.parse(await fs.readFile(settings().snapshotPath, "utf8"));
  } catch (error) {
    throw new Error("Prepared ontology data is missing or invalid. Run npm run build:fast or npm run data:refresh first.", { cause: error });
  }
}
