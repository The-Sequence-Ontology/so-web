import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));

export function settings(env = process.env) {
  const siblingRepo = path.resolve(projectRoot, "../SO-Ontologies");
  const defaultRepo = fs.existsSync(path.join(siblingRepo, "Ontology_Files", "so.owl"))
    ? siblingRepo
    : path.resolve(projectRoot, "../context/SO-Ontologies");
  const ontologyRepoDir = path.resolve(env.SO_ONTOLOGY_REPO || defaultRepo);
  const cacheDir = path.resolve(env.SO_CACHE_DIR || path.join(projectRoot, ".cache"));
  return {
    ontologyRepoDir,
    ontologyDir: path.resolve(env.SO_ONTOLOGY_DIR || path.join(ontologyRepoDir, "Ontology_Files")),
    cacheDir,
    snapshotPath: path.join(cacheDir, "site-data.json"),
    publicDir: path.join(cacheDir, "site-public")
  };
}

// Only these generated directories may be erased by a clean build.
export function outputDirectory(value = process.env.BUILD_DIR || "dist") {
  const output = path.resolve(projectRoot, value);
  if (path.dirname(output) !== path.resolve(projectRoot) || !/^dist(?:-[a-zA-Z0-9_.-]+)?$/.test(path.basename(output))) {
    throw new Error("BUILD_DIR must be dist or a dist-* directory directly inside this repository.");
  }
  if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) {
    throw new Error("The build output directory must not be a symbolic link.");
  }
  return output;
}
