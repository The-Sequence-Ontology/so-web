import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { settings, projectRoot } from "../lib/build-paths.mjs";
import { collectTermHistory, termHistoryCacheVersion } from "../lib/history.mjs";
import { buildGraphData, buildNormalizedTerms, createSearchTokens, parseMetrics, parseOntologyMetadata, parseTermsFromOwl } from "../lib/ontology.mjs";
import { buildTermPayload } from "../lib/graph-payload.mjs";
import { buildSiteData } from "../lib/site-data.mjs";

const execFileAsync = promisify(execFile);
const schemaVersion = 1;
const inputNames = ["so.owl", "so.json", "so-metadata.txt"];
const hash = (value) => createHash("sha256").update(value).digest("hex");

async function readSnapshot(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function publicFilesExist(snapshot, publicDir) {
  const files = [
    "assets/search-index.json", "assets/metadata.json", "assets/graph-manifest.json",
    ...inputNames.map((name) => "downloads/" + name),
    ...snapshot.terms.map((term) => "assets/terms/" + term.id + ".json")
  ];
  try {
    await Promise.all(files.map((file) => fs.access(path.join(publicDir, file))));
    return true;
  } catch {
    return false;
  }
}

export async function prepareData({ mode = "full", reuse = false, config = settings() } = {}) {
  if (!["fast", "full"].includes(mode)) throw new Error("Unknown data preparation mode: " + mode);
  const { ontologyDir, ontologyRepoDir, cacheDir, snapshotPath, publicDir } = config;
  let inputs;
  try {
    inputs = await Promise.all(inputNames.map((name) => fs.readFile(path.join(ontologyDir, name), "utf8")));
  } catch (error) {
    throw new Error("Cannot read ontology release files in " + ontologyDir +
      ". Set SO_ONTOLOGY_REPO or SO_ONTOLOGY_DIR; the directory must contain " + inputNames.join(", ") + ".", { cause: error });
  }
  const processorFiles = ["lib/ontology.mjs", "lib/history.mjs", "lib/site-data.mjs", "lib/graph-payload.mjs", "scripts/prepare-data.mjs"];
  const processorHash = hash((await Promise.all(processorFiles.map((file) => fs.readFile(path.join(projectRoot, file), "utf8")))).join("\n"));
  const source = {
    directory: ontologyDir,
    files: Object.fromEntries(inputNames.map((name, index) => [name, hash(inputs[index])])),
    processorHash
  };
  const previous = await readSnapshot(snapshotPath);
  let repoHead = null;
  if (mode === "full" || (reuse && previous?.historyMode === "full")) {
    try {
      repoHead = (await execFileAsync("git", ["-C", ontologyRepoDir, "rev-parse", "HEAD"])).stdout.trim();
    } catch (error) {
      if (mode === "full") {
        throw new Error("Full preparation needs an ontology Git checkout. Set SO_ONTOLOGY_REPO or use npm run build:fast.", { cause: error });
      }
    }
  }
  const historyMatches = previous?.historyMode === "fast"
    ? mode === "fast"
    : previous?.historyMode === "full" && previous.historySource?.repoHead === repoHead &&
      previous.historySource?.cacheVersion === termHistoryCacheVersion;
  if (reuse && previous?.schemaVersion === schemaVersion &&
      Array.isArray(previous.terms) && Array.isArray(previous.pageTerms) && historyMatches &&
      JSON.stringify(previous.source) === JSON.stringify(source) &&
      await publicFilesExist(previous, publicDir)) {
    console.log("Reusing prepared " + previous.historyMode + " data for " + previous.terms.length + " terms.");
    return previous;
  }

  const [owl, graphText, metricsText] = inputs;
  const metadata = parseOntologyMetadata(owl);
  const metrics = parseMetrics(metricsText);
  const termsByIri = parseTermsFromOwl(owl);
  const { parents, children, related, relatedIncoming } = buildGraphData(JSON.parse(graphText).graphs[0], termsByIri);
  const ids = [...termsByIri.values()].filter((term) => term.id.startsWith("SO:")).map((term) => term.id);
  const termHistory = mode === "full"
    ? await collectTermHistory({ termIds: ids, repoDir: ontologyRepoDir, cacheDir })
    : {};
  const terms = buildNormalizedTerms({ termsByIri, parents, children, related, relatedIncoming, termHistory });
  const siteData = buildSiteData({ terms, termsByIri, related, relatedIncoming, metadata, metrics });
  const snapshot = {
    schemaVersion,
    source,
    historyMode: mode,
    historySource: mode === "full" ? { repoHead, cacheVersion: termHistoryCacheVersion } : null,
    ...siteData
  };
  const searchIndex = terms.map((term) => ({
    id: term.id,
    label: term.label,
    synonyms: term.synonyms.map((synonym) => synonym.value),
    alt_ids: term.altIds,
    definition_snippet: term.definition.text,
    url: "../term/" + term.id + "/",
    tokens: createSearchTokens(term)
  }));
  const staging = path.join(cacheDir, "site-public-next-" + process.pid);
  await fs.mkdir(path.join(staging, "assets", "terms"), { recursive: true });
  await fs.mkdir(path.join(staging, "downloads"), { recursive: true });
  const writeJson = (name, value) => fs.writeFile(path.join(staging, "assets", name), JSON.stringify(value));
  try {
    await writeJson("search-index.json", searchIndex);
    await writeJson("metadata.json", { metadata, metrics });
    await writeJson("graph-manifest.json", {
      schemaVersion: 1,
      release: { ontologyIri: metadata.ontologyIri || "", versionIri: metadata.versionIri || "", date: metadata.releaseDate || "" },
      termCount: terms.length,
      payloadTemplate: "terms/{SO_ID}.json"
    });
    await Promise.all(inputNames.map((name, index) => fs.writeFile(path.join(staging, "downloads", name), inputs[index])));
    await Promise.all(terms.map((term) => writeJson("terms/" + term.id + ".json", buildTermPayload(term, termsByIri, metadata))));
    await fs.rm(publicDir, { recursive: true, force: true });
    await fs.rename(staging, publicDir);
    const temporarySnapshot = snapshotPath + "." + process.pid + ".tmp";
    await fs.writeFile(temporarySnapshot, JSON.stringify(snapshot));
    // Publish after every public file is ready; this is the development watch target.
    await fs.rename(temporarySnapshot, snapshotPath);
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
  console.log("Prepared " + terms.length + " terms (" + mode + " history mode).");
  return snapshot;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  prepareData({ mode: process.argv.includes("--fast") || process.env.SKIP_HISTORY === "1" ? "fast" : "full" })
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
