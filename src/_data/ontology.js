import fs from "node:fs/promises";
import { settings } from "../../lib/build-paths.mjs";
import { buildOntologyTree } from "../../lib/ontology-tree.mjs";

export default async function () {
  try {
    const snapshot = JSON.parse(await fs.readFile(settings().snapshotPath, "utf8"));
    return { ...snapshot, hierarchy: buildOntologyTree(snapshot.terms) };
  } catch (error) {
    throw new Error("Prepared ontology data is missing or invalid. Run npm run build:fast or npm run data:refresh first.", { cause: error });
  }
}
