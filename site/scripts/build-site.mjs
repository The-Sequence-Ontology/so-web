import fs from "node:fs/promises";
import path from "node:path";
import { collectTermHistory } from "../lib/history.mjs";
import {
  buildGraphData,
  buildNormalizedTerms,
  createSearchTokens,
  parseMetrics,
  parseOntologyMetadata,
  parseTermsFromOwl
} from "../lib/ontology.mjs";
import {
  buildTermPayload,
  renderAboutPage,
  renderBrowsePage,
  renderHomePage,
  renderReleasePage,
  renderSearchPage,
  renderTermPage
} from "../lib/pages.mjs";
import { canonicalTermPath } from "../lib/shared.mjs";

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const repoRoot = path.resolve(projectRoot, "..");
const ontologyRepoDir = path.resolve(process.env.SO_ONTOLOGY_REPO || path.join(repoRoot, "context", "SO-Ontologies"));
const ontologyDir = path.resolve(process.env.SO_ONTOLOGY_DIR || path.join(ontologyRepoDir, "Ontology_Files"));
const distDir = path.join(projectRoot, process.env.BUILD_DIR || "dist");
const assetsDir = path.join(projectRoot, "src", "assets");
const cacheDir = path.join(projectRoot, ".cache");

const owlPath = path.join(ontologyDir, "so.owl");
const jsonPath = path.join(ontologyDir, "so.json");
const metricsPath = path.join(ontologyDir, "so-metadata.txt");

async function writeFile(targetPath, content) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content, "utf8");
}

async function removeTree(targetPath) {
  await fs.rm(targetPath, { recursive: true, force: true });
}


async function main() {
  const [owl, graphJsonText, metricsText, cssText, searchJsText, graphJsText] = await Promise.all([
    fs.readFile(owlPath, "utf8"),
    fs.readFile(jsonPath, "utf8"),
    fs.readFile(metricsPath, "utf8"),
    fs.readFile(path.join(assetsDir, "styles.css"), "utf8"),
    fs.readFile(path.join(assetsDir, "search.js"), "utf8"),
    fs.readFile(path.join(assetsDir, "graph.js"), "utf8")
  ]);

  const metadata = parseOntologyMetadata(owl);
  const metrics = parseMetrics(metricsText);
  const termsByIri = parseTermsFromOwl(owl);
  const jsonGraph = JSON.parse(graphJsonText).graphs[0];
  const { parents, children, related, relatedIncoming } = buildGraphData(jsonGraph, termsByIri);

  const sourceTerms = [...termsByIri.values()]
    .filter((term) => term.id.startsWith("SO:"))
    .sort((a, b) => a.id.localeCompare(b.id));
  const termHistory =
    process.env.SKIP_HISTORY === "1"
      ? {}
      : await collectTermHistory({
          termIds: sourceTerms.map((term) => term.id),
          repoDir: ontologyRepoDir,
          cacheDir
        });

  const normalizedTerms = buildNormalizedTerms({
    termsByIri,
    parents,
    children,
    related,
    relatedIncoming,
    termHistory
  });

  const byPublicId = new Map(normalizedTerms.map((term) => [term.id, term]));
  const searchIndex = normalizedTerms.map((term) => ({
    id: term.id,
    label: term.label,
    synonyms: term.synonyms.map((synonym) => synonym.value),
    alt_ids: term.altIds,
    definition_snippet: term.definition.text,
    url: `../term/${term.id}/`,
    tokens: createSearchTokens(term)
  }));

  await removeTree(distDir);
  await fs.mkdir(path.join(distDir, "assets"), { recursive: true });
  await fs.writeFile(path.join(distDir, "assets", "styles.css"), cssText);
  await fs.writeFile(path.join(distDir, "assets", "search.js"), searchJsText);
  await fs.writeFile(path.join(distDir, "assets", "graph.js"), graphJsText);
  await fs.writeFile(path.join(distDir, "assets", "search-index.json"), JSON.stringify(searchIndex));
  await fs.writeFile(path.join(distDir, "assets", "metadata.json"), JSON.stringify({ metadata, metrics }, null, 2));
  await fs.writeFile(
    path.join(distDir, "assets", "graph-manifest.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        release: {
          ontologyIri: metadata.ontologyIri || "",
          versionIri: metadata.versionIri || "",
          date: metadata.releaseDate || ""
        },
        termCount: normalizedTerms.length,
        payloadTemplate: "terms/{SO_ID}.json"
      },
      null,
      2
    )
  );
  await fs.mkdir(path.join(distDir, "downloads"), { recursive: true });
  await fs.writeFile(path.join(distDir, "downloads", "so.owl"), owl);
  await fs.writeFile(path.join(distDir, "downloads", "so.json"), graphJsonText);
  await fs.writeFile(path.join(distDir, "downloads", "so-metadata.txt"), metricsText);

  const rootHighlights = ["SO:0000110", "SO:0000400", "SO:0000704", "SO:0001411"].map((id) => byPublicId.get(id)).filter(Boolean);

  await writeFile(path.join(distDir, "index.html"), renderHomePage({ metadata, metrics, rootHighlights }));

  const activeTopLevelTerms = normalizedTerms.filter((term) => !term.parents.length && !term.isObsolete).slice(0, 20);

  await writeFile(path.join(distDir, "browser", "current_release", "index.html"), renderBrowsePage(activeTopLevelTerms));

  await writeFile(path.join(distDir, "browser", "current_release", "about", "index.html"), renderAboutPage());

  await writeFile(path.join(distDir, "browser", "current_release", "release", "index.html"), renderReleasePage({ metadata, metrics }));

  await writeFile(path.join(distDir, "browser", "current_release", "search", "index.html"), renderSearchPage());

  for (const term of normalizedTerms) {
    await writeFile(
      path.join(distDir, canonicalTermPath(term.id), "index.html"),
      renderTermPage(term, termsByIri, related, relatedIncoming)
    );

    const payload = buildTermPayload(term, termsByIri, metadata);
    await writeFile(path.join(distDir, "assets", "terms", `${term.id}.json`), JSON.stringify(payload));
  }

  const redirects = [];
  for (const term of normalizedTerms) {
    redirects.push([term.compactId, term.id]);
    for (const altId of term.altIds) {
      redirects.push([altId.replace(":", "_"), term.id]);
      redirects.push([altId, term.id]);
    }
  }

  for (const [alias, targetId] of redirects) {
    const redirectHtml = `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=../${targetId}/"><title>Redirecting</title><p>Redirecting to <a href="../${targetId}/">${targetId}</a>.</p>`;
    await writeFile(path.join(distDir, "browser", "current_release", "term", alias, "index.html"), redirectHtml);
  }

  console.log(`Built ${normalizedTerms.length} term pages in ${distDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
