import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const repoRoot = path.resolve(projectRoot, "..");
const ontologyDir = path.join(repoRoot, "context", "SO-Ontologies", "Ontology_Files");
const ontologyRepoDir = path.join(repoRoot, "context", "SO-Ontologies");
const distDir = path.join(projectRoot, process.env.BUILD_DIR || "dist");
const assetsDir = path.join(projectRoot, "src", "assets");
const cacheDir = path.join(projectRoot, ".cache");

const owlPath = path.join(ontologyDir, "so.owl");
const jsonPath = path.join(ontologyDir, "so.json");
const metricsPath = path.join(ontologyDir, "so-metadata.txt");
const execFileAsync = promisify(execFile);

const iriPrefix = "http://purl.obolibrary.org/obo/";

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slugFromIri(iri) {
  return iri.replace(iriPrefix, "");
}

function publicIdFromIri(iri) {
  const slug = slugFromIri(iri);
  if (slug.startsWith("SO_")) {
    return slug.replace("SO_", "SO:");
  }
  return slug;
}

function normalizeWhitespace(value = "") {
  return value.replace(/\s+/g, " ").trim();
}

function stripTags(value = "") {
  return normalizeWhitespace(
    value
      .replace(/<[^>]+>/g, " ")
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&gt;/g, ">")
      .replace(/&lt;/g, "<")
      .replace(/&amp;/g, "&")
  );
}

function extractSingleText(block, tag) {
  const pattern = new RegExp(`<${tag}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${tag}>`);
  const match = block.match(pattern);
  return match ? stripTags(match[1]) : "";
}

function extractAllText(block, tag) {
  const pattern = new RegExp(`<${tag}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "g");
  const values = [];
  let match;
  while ((match = pattern.exec(block))) {
    values.push(stripTags(match[1]));
  }
  return values;
}

function extractAllResources(block, tag) {
  const pattern = new RegExp(`<${tag}[^>]*rdf:resource="([^"]+)"[^>]*/?>`, "g");
  const values = [];
  let match;
  while ((match = pattern.exec(block))) {
    values.push(match[1]);
  }
  return values;
}

function relativeHref(depth, targetPath) {
  return `${"../".repeat(depth)}${targetPath}`.replace(/\/+/g, "/");
}

function canonicalTermPath(id) {
  return `browser/current_release/term/${id}/`;
}

function parseOntologyMetadata(owl) {
  const blockMatch = owl.match(/<owl:Ontology[^>]*>([\s\S]*?)<\/owl:Ontology>/);
  const block = blockMatch ? blockMatch[1] : "";
  const ontologyIri = (owl.match(/<owl:Ontology rdf:about="([^"]+)"/) || [])[1] || "";
  const versionIri = (block.match(/<owl:versionIRI rdf:resource="([^"]+)"/) || [])[1] || "";
  const savedBy = extractSingleText(block, "oboInOwl:saved-by");
  const releaseDate = extractSingleText(block, "oboInOwl:date");
  const defaultNamespace = extractSingleText(block, "oboInOwl:default-namespace");
  return { ontologyIri, versionIri, savedBy, releaseDate, defaultNamespace };
}

function parseDefinitionXrefs(owl) {
  const map = new Map();
  const pattern = /<owl:Axiom>([\s\S]*?)<\/owl:Axiom>/g;
  let match;
  while ((match = pattern.exec(owl))) {
    const block = match[1];
    const source = (block.match(/<owl:annotatedSource rdf:resource="([^"]+)"/) || [])[1];
    const property = (block.match(/<owl:annotatedProperty rdf:resource="([^"]+)"/) || [])[1];
    if (!source || property !== "http://purl.obolibrary.org/obo/IAO_0000115") {
      continue;
    }
    const xrefs = extractAllText(block, "oboInOwl:hasDbXref");
    if (xrefs.length) {
      map.set(source, xrefs);
    }
  }
  return map;
}

function parseTermsFromOwl(owl) {
  const terms = new Map();
  const definitionXrefs = parseDefinitionXrefs(owl);
  const pattern = /<owl:Class rdf:about="([^"]*SO_[^"]+)">([\s\S]*?)<\/owl:Class>/g;
  let match;
  while ((match = pattern.exec(owl))) {
    const iri = match[1];
    const block = match[2];
    const id = extractSingleText(block, "oboInOwl:id") || publicIdFromIri(iri);
    const term = {
      iri,
      compactId: slugFromIri(iri),
      id,
      label: extractSingleText(block, "rdfs:label"),
      definition: {
        text: extractSingleText(block, "obo:IAO_0000115"),
        xrefs: definitionXrefs.get(iri) || []
      },
      comments: extractAllText(block, "rdfs:comment"),
      synonyms: [
        ...extractAllText(block, "oboInOwl:hasExactSynonym").map((value) => ({ scope: "exact", value })),
        ...extractAllText(block, "oboInOwl:hasRelatedSynonym").map((value) => ({ scope: "related", value })),
        ...extractAllText(block, "oboInOwl:hasBroadSynonym").map((value) => ({ scope: "broad", value })),
        ...extractAllText(block, "oboInOwl:hasNarrowSynonym").map((value) => ({ scope: "narrow", value }))
      ],
      xrefs: extractAllText(block, "oboInOwl:hasDbXref"),
      subsets: extractAllResources(block, "oboInOwl:inSubset").map((subset) => subset.split("#").pop()),
      altIds: extractAllText(block, "oboInOwl:hasAlternativeId"),
      namespace: extractSingleText(block, "oboInOwl:hasOBONamespace"),
      isObsolete: /<owl:deprecated[^>]*>\s*true\s*<\/owl:deprecated>/.test(block),
      replacedBy: extractAllResources(block, "obo:IAO_0100001").map(publicIdFromIri)
    };
    terms.set(iri, term);
  }
  return terms;
}

function parseMetrics(text) {
  const lines = text.trim().split(/\r?\n/);
  const metrics = {};
  for (const line of lines) {
    const [key, value] = line.split("\t");
    if (!key || value === undefined) {
      continue;
    }
    if (!(key in metrics)) {
      metrics[key] = value;
    }
  }
  return metrics;
}

function buildGraphData(jsonGraph, termMap) {
  const nodesByIri = new Map();
  for (const node of jsonGraph.nodes) {
    nodesByIri.set(node.id, node);
    if (!termMap.has(node.id) && node.id.includes("/SO_")) {
      termMap.set(node.id, {
        iri: node.id,
        compactId: slugFromIri(node.id),
        id: publicIdFromIri(node.id),
        label: node.lbl || publicIdFromIri(node.id),
        definition: { text: node.meta?.definition?.val || "", xrefs: node.meta?.definition?.xrefs || [] },
        comments: node.meta?.comments || [],
        synonyms: (node.meta?.synonyms || []).map((entry) => ({
          scope: String(entry.pred || "").replace(/^has/i, "").replace(/Synonym$/, "").toLowerCase() || "related",
          value: entry.val
        })),
        xrefs: (node.meta?.xrefs || []).map((entry) => entry.val),
        subsets: (node.meta?.subsets || []).map((subset) => subset.split("#").pop()),
        altIds: [],
        namespace: "",
        isObsolete: false,
        replacedBy: []
      });
    }
  }

  const parents = new Map();
  const children = new Map();
  const related = new Map();

  for (const edge of jsonGraph.edges) {
    if (!termMap.has(edge.sub) || !termMap.has(edge.obj)) {
      continue;
    }

    if (edge.pred === "is_a") {
      if (!parents.has(edge.sub)) parents.set(edge.sub, []);
      if (!children.has(edge.obj)) children.set(edge.obj, []);
      parents.get(edge.sub).push(edge.obj);
      children.get(edge.obj).push(edge.sub);
      continue;
    }

    if (!related.has(edge.sub)) related.set(edge.sub, []);
    related.get(edge.sub).push({ predicate: edge.pred, target: edge.obj });
  }

  return { nodesByIri, parents, children, related };
}

function computeClosure(startIri, adjacency) {
  const visited = new Set();
  const queue = [...(adjacency.get(startIri) || [])];
  while (queue.length) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacency.get(current) || []) {
      queue.push(next);
    }
  }
  return [...visited];
}

function createSearchTokens(term) {
  const values = [
    term.id,
    term.compactId,
    term.label,
    term.definition.text,
    ...term.altIds,
    ...term.synonyms.map((synonym) => synonym.value)
  ]
    .filter(Boolean)
    .join(" || ")
    .toLowerCase();
  return values;
}

function formatRelationList(items, termByIri) {
  if (!items.length) {
    return "<p class=\"muted\">None recorded in the current release neighborhood.</p>";
  }
  return `<ul class="link-list">${items
    .map((iri) => {
      const term = termByIri.get(iri);
      if (!term) return "";
      return `<li><a href="${relativeHref(4, canonicalTermPath(term.id))}">${escapeHtml(term.id)} - ${escapeHtml(term.label)}</a></li>`;
    })
    .join("")}</ul>`;
}

function groupRelationships(relations) {
  const groups = new Map();
  for (const relation of relations) {
    if (!groups.has(relation.predicate)) groups.set(relation.predicate, []);
    groups.get(relation.predicate).push(relation.target);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function buildDagSvg(term, graphNeighborhood, termByIri) {
  const parents = graphNeighborhood.parents.slice(0, 5);
  const children = graphNeighborhood.children.slice(0, 6);
  const related = graphNeighborhood.related.slice(0, 4);
  const rows = [
    { items: parents, y: 54, label: "Parent terms" },
    { items: [term.iri], y: 170, label: "Current term" },
    { items: children, y: 286, label: "Child terms" },
    { items: related, y: 402, label: "Related terms" }
  ].filter((row) => row.items.length);

  const nodes = [];
  const edges = [];

  for (const row of rows) {
    const totalWidth = Math.max(row.items.length * 170, 170);
    const startX = 560 - totalWidth / 2;
    row.items.forEach((iri, index) => {
      const x = startX + index * 170;
      nodes.push({ iri, x, y: row.y, current: iri === term.iri });
    });
  }

  const nodeLookup = new Map(nodes.map((node) => [node.iri, node]));
  const focal = nodeLookup.get(term.iri);

  for (const iri of parents) {
    if (nodeLookup.has(iri) && focal) edges.push([iri, term.iri]);
  }
  for (const iri of children) {
    if (nodeLookup.has(iri) && focal) edges.push([term.iri, iri]);
  }
  for (const iri of related) {
    if (nodeLookup.has(iri) && focal) edges.push([term.iri, iri]);
  }

  const desc = `Ontology neighborhood graph for ${term.id} ${term.label}. Parent, child, and related nodes can be activated to open their term pages.`;

  return `
<figure class="dag-figure">
  <svg class="dag-svg" viewBox="0 0 1120 470" role="img" aria-labelledby="dag-title-${term.compactId} dag-desc-${term.compactId}">
    <title id="dag-title-${term.compactId}">Ontology neighborhood for ${escapeHtml(term.id)}</title>
    <desc id="dag-desc-${term.compactId}">${escapeHtml(desc)}</desc>
    ${edges
      .map(([from, to]) => {
        const fromNode = nodeLookup.get(from);
        const toNode = nodeLookup.get(to);
        return `<line class="dag-edge" x1="${fromNode.x + 70}" y1="${fromNode.y + 30}" x2="${toNode.x + 70}" y2="${toNode.y}" />`;
      })
      .join("")}
    ${nodes
      .map((node) => {
        const target = termByIri.get(node.iri);
        if (!target) return "";
        const label = `${target.id} ${target.label}`.slice(0, 32);
        return `
      <a href="${relativeHref(4, canonicalTermPath(target.id))}" class="dag-node ${node.current ? "is-current" : ""}">
        <title>${escapeHtml(target.id)} ${escapeHtml(target.label)}</title>
        <rect x="${node.x}" y="${node.y}" width="140" height="58"></rect>
        <text x="${node.x + 12}" y="${node.y + 24}">${escapeHtml(target.id)}</text>
        <text x="${node.x + 12}" y="${node.y + 43}">${escapeHtml(label.replace(`${target.id} `, ""))}</text>
      </a>`;
      })
      .join("")}
  </svg>
  <figcaption>The local DAG shows nearby parent, child, and related terms. Each node links to its own term page.</figcaption>
</figure>`;
}

function page(title, content, depth = 0) {
  const prefix = "../".repeat(depth);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="${prefix}assets/styles.css" />
  </head>
  <body>
    <header class="site-header">
      <div class="shell">
        <div class="masthead">
          <p class="kicker">Sequence Ontology Prototype</p>
          <h1>Sequence Ontology Browser</h1>
          <p>Prototype website generated from the current OWL release for term content and the JSON graph export for local ontology navigation.</p>
          <nav class="nav" aria-label="Primary">
            <a href="${prefix}index.html">Home</a>
            <a href="${prefix}browser/current_release/">Browse</a>
            <a href="${prefix}browser/current_release/search/">Search</a>
            <a href="${prefix}browser/current_release/release/">Release</a>
            <a href="${prefix}browser/current_release/about/">About</a>
          </nav>
        </div>
      </div>
    </header>
    <main>
      <div class="shell">${content}</div>
    </main>
    <footer class="site-footer">
      <div class="shell">
        <p>This prototype prioritizes direct term URLs, accessible text content, and clickable ontology navigation.</p>
      </div>
    </footer>
  </body>
</html>`;
}

async function writeFile(targetPath, content) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content, "utf8");
}

async function removeTree(targetPath) {
  await execFileAsync("rm", ["-rf", targetPath], {
    maxBuffer: 1024 * 1024
  });
}

async function readJsonIfExists(targetPath) {
  try {
    return JSON.parse(await fs.readFile(targetPath, "utf8"));
  } catch {
    return null;
  }
}

async function getGitHead(repoDir) {
  const { stdout } = await execFileAsync("git", ["-C", repoDir, "rev-parse", "HEAD"], {
    maxBuffer: 1024 * 1024
  });
  return stdout.trim();
}

async function collectTermHistory(termIds) {
  await fs.mkdir(cacheDir, { recursive: true });
  const cachePath = path.join(cacheDir, "term-history.json");
  const repoHead = await getGitHead(ontologyRepoDir);
  const cached = await readJsonIfExists(cachePath);
  if (cached?.repoHead === repoHead && cached?.history) {
    return cached.history;
  }

  const history = {};
  const concurrency = Math.max(4, Math.min(12, os.cpus().length || 4));
  let index = 0;

  async function worker() {
    while (index < termIds.length) {
      const currentIndex = index++;
      const termId = termIds[currentIndex];
      const range = `/^id: ${termId}$/,/^$/`;
      try {
        const { stdout } = await execFileAsync(
          "git",
          [
            "-C",
            ontologyRepoDir,
            "log",
            "-L",
            `${range}:so-edit.obo`,
            "--no-patch",
            "--format=%H%x09%ad%x09%s",
            "--date=short"
          ],
          { maxBuffer: 1024 * 1024 * 4 }
        );

        const entries = stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [hash, date, ...subjectParts] = line.split("\t");
            const subject = subjectParts.join("\t").trim();
            return {
              hash,
              shortHash: hash.slice(0, 7),
              date,
              subject
            };
          });

        history[termId] = {
          firstSeen: entries.length ? entries[entries.length - 1] : null,
          mostRecent: entries.length ? entries[0] : null,
          entries: entries.slice(0, 6)
        };
      } catch {
        history[termId] = {
          firstSeen: null,
          mostRecent: null,
          entries: []
        };
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  await fs.writeFile(cachePath, JSON.stringify({ repoHead, history }));
  return history;
}

async function main() {
  const [owl, graphJsonText, metricsText, cssText, searchJsText] = await Promise.all([
    fs.readFile(owlPath, "utf8"),
    fs.readFile(jsonPath, "utf8"),
    fs.readFile(metricsPath, "utf8"),
    fs.readFile(path.join(assetsDir, "styles.css"), "utf8"),
    fs.readFile(path.join(assetsDir, "search.js"), "utf8")
  ]);

  const metadata = parseOntologyMetadata(owl);
  const metrics = parseMetrics(metricsText);
  const termsByIri = parseTermsFromOwl(owl);
  const jsonGraph = JSON.parse(graphJsonText).graphs[0];
  const { parents, children, related } = buildGraphData(jsonGraph, termsByIri);

  const terms = [...termsByIri.values()]
    .filter((term) => term.id.startsWith("SO:"))
    .sort((a, b) => a.id.localeCompare(b.id));
  const termHistory = await collectTermHistory(terms.map((term) => term.id));

  const byPublicId = new Map(terms.map((term) => [term.id, term]));
  const altIdIndex = new Map();
  for (const term of terms) {
    for (const altId of term.altIds) {
      altIdIndex.set(altId, term.id);
    }
  }

  const normalizedTerms = terms.map((term) => {
    const parentIris = parents.get(term.iri) || [];
    const childIris = children.get(term.iri) || [];
    const relationEntries = related.get(term.iri) || [];
    return {
      ...term,
      canonicalUrl: `/${canonicalTermPath(term.id)}`,
      history: termHistory[term.id] || { firstSeen: null, mostRecent: null, entries: [] },
      parents: parentIris.map((iri) => publicIdFromIri(iri)),
      children: childIris.map((iri) => publicIdFromIri(iri)),
      ancestors: computeClosure(term.iri, parents).map((iri) => publicIdFromIri(iri)),
      descendants: computeClosure(term.iri, children).map((iri) => publicIdFromIri(iri)),
      relationships: relationEntries.map((entry) => ({
        predicate: entry.predicate,
        target: publicIdFromIri(entry.target)
      })),
      graphNeighborhood: {
        parents: parentIris,
        children: childIris,
        related: relationEntries.map((entry) => entry.target)
      }
    };
  });

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
  await fs.writeFile(path.join(distDir, "assets", "search-index.json"), JSON.stringify(searchIndex));
  await fs.writeFile(path.join(distDir, "assets", "metadata.json"), JSON.stringify({ metadata, metrics }, null, 2));
  await fs.mkdir(path.join(distDir, "downloads"), { recursive: true });
  await fs.writeFile(path.join(distDir, "downloads", "so.owl"), owl);
  await fs.writeFile(path.join(distDir, "downloads", "so.json"), graphJsonText);
  await fs.writeFile(path.join(distDir, "downloads", "so-metadata.txt"), metricsText);

  const rootHighlights = ["SO:0000110", "SO:0000400", "SO:0000704", "SO:0001411"].map((id) => byPublicId.get(id)).filter(Boolean);

  await writeFile(
    path.join(distDir, "index.html"),
    page(
      "Sequence Ontology Browser Prototype",
      `
      <section class="card">
        <p class="kicker">Prototype</p>
        <h2>Modernized term browser around the current OWL release</h2>
        <p class="lede">This prototype keeps direct term URLs, uses OWL for displayed annotations, and uses the JSON graph export to generate local ontology DAG views with clickable term nodes.</p>
        <div class="search-box">
          <a class="button" href="browser/current_release/search/?q=sequence_feature">Search the ontology</a>
          <a class="button" href="browser/current_release/term/SO:0000110/">Open a canonical term page</a>
        </div>
      </section>
      <section class="grid two" aria-label="Highlights">
        <article class="card">
          <h2>Current release snapshot</h2>
          <p><strong>Ontology IRI:</strong> ${escapeHtml(metadata.ontologyIri || "Unavailable")}</p>
          <p><strong>Version IRI:</strong> ${escapeHtml(metadata.versionIri || "Unavailable")}</p>
          <p><strong>Release date:</strong> ${escapeHtml(metadata.releaseDate || "Unavailable")}</p>
          <p><strong>Classes:</strong> ${escapeHtml(metrics["NUMBER_OF_CLASSES.INCLUDE_IMPORT_CLOSURE=false"] || "Unavailable")}</p>
        </article>
        <article class="card">
          <h2>Prototype priorities</h2>
          <ul>
            <li>Canonical URLs at <code>/browser/current_release/term/&lt;SO_ID&gt;/</code></li>
            <li>Accessible text-first term pages</li>
            <li>Clickable DAG nodes for parent and child navigation</li>
            <li>Release metadata and direct ontology downloads</li>
          </ul>
        </article>
      </section>
      <section class="card">
        <h2>Suggested entry points</h2>
        <ul class="link-list">
          ${rootHighlights
            .map((term) => `<li><a href="${canonicalTermPath(term.id)}">${escapeHtml(term.id)} - ${escapeHtml(term.label)}</a></li>`)
            .join("")}
        </ul>
      </section>`,
      0
    )
  );

  const activeTopLevelTerms = normalizedTerms.filter((term) => !term.parents.length && !term.isObsolete).slice(0, 20);

  await writeFile(
    path.join(distDir, "browser", "current_release", "index.html"),
    page(
      "Current Release Browse",
      `
      <p class="breadcrumbs"><a href="../../index.html">Home</a> / Current release</p>
      <section class="card">
        <h2>Browse the current release</h2>
        <p class="lede">This entry page links into representative top-level terms from the current release. Search remains the fastest path for most users.</p>
        <ul class="link-list">
          ${activeTopLevelTerms
            .map((term) => `<li><a href="term/${term.id}/">${escapeHtml(term.id)} - ${escapeHtml(term.label)}</a></li>`)
            .join("")}
        </ul>
      </section>`,
      2
    )
  );

  await writeFile(
    path.join(distDir, "browser", "current_release", "about", "index.html"),
    page(
      "About the Prototype",
      `
      <p class="breadcrumbs"><a href="../../../index.html">Home</a> / About</p>
      <section class="card">
        <h2>About this prototype</h2>
        <p>This prototype demonstrates the target URL contract and information architecture for a modernized Sequence Ontology website.</p>
        <ul>
          <li>Displayed term annotations are sourced from the OWL release.</li>
          <li>Graph structure is derived from the JSON graph export.</li>
          <li>Each term has its own canonical URL.</li>
          <li>The DAG acts as a navigational supplement, not the only way to understand relationships.</li>
        </ul>
      </section>`,
      3
    )
  );

  await writeFile(
    path.join(distDir, "browser", "current_release", "release", "index.html"),
    page(
      "Release Metadata",
      `
      <p class="breadcrumbs"><a href="../../../index.html">Home</a> / Release</p>
      <section class="card">
        <h2>Current release metadata</h2>
        <div class="table-wrap">
          <table>
            <tbody>
              <tr><th scope="row">Ontology IRI</th><td>${escapeHtml(metadata.ontologyIri || "Unavailable")}</td></tr>
              <tr><th scope="row">Version IRI</th><td>${escapeHtml(metadata.versionIri || "Unavailable")}</td></tr>
              <tr><th scope="row">Release date</th><td>${escapeHtml(metadata.releaseDate || "Unavailable")}</td></tr>
              <tr><th scope="row">Saved by</th><td>${escapeHtml(metadata.savedBy || "Unavailable")}</td></tr>
              <tr><th scope="row">Default namespace</th><td>${escapeHtml(metadata.defaultNamespace || "Unavailable")}</td></tr>
              <tr><th scope="row">Classes</th><td>${escapeHtml(metrics["NUMBER_OF_CLASSES.INCLUDE_IMPORT_CLOSURE=false"] || "Unavailable")}</td></tr>
              <tr><th scope="row">Non-deprecated classes</th><td>${escapeHtml(metrics["NUMBER_OF_NON_DEPRECATED_CLASSES.INCLUDE_IMPORT_CLOSURE=false"] || "Unavailable")}</td></tr>
            </tbody>
          </table>
        </div>
        <p><a href="../../../downloads/so.owl">OWL source</a>, <a href="../../../downloads/so.json">JSON graph export</a>, and <a href="../../../downloads/so-metadata.txt">release metrics</a> are copied into the built prototype.</p>
      </section>`,
      3
    )
  );

  await writeFile(
    path.join(distDir, "browser", "current_release", "search", "index.html"),
    page(
      "Search the Sequence Ontology",
      `
      <p class="breadcrumbs"><a href="../../../index.html">Home</a> / Search</p>
      <section class="card">
        <h2>Search the ontology</h2>
        <label class="visually-hidden" for="ontology-search">Search for a Sequence Ontology term</label>
        <div class="search-box">
          <input id="ontology-search" type="search" data-search-input placeholder="Search by SO ID, label, synonym, or alternate ID" />
        </div>
        <p id="search-summary" data-search-summary class="muted">Enter a Sequence Ontology term ID, label, or synonym.</p>
        <ul data-search-results class="search-results" aria-live="polite"></ul>
      </section>
      <script src="../../../assets/search.js" type="module"></script>`,
      3
    )
  );

  for (const term of normalizedTerms) {
    const parentIris = term.graphNeighborhood.parents;
    const childIris = term.graphNeighborhood.children;
    const relatedIris = term.graphNeighborhood.related;
    const grouped = groupRelationships((related.get(term.iri) || []).map((entry) => ({ predicate: entry.predicate, target: entry.target })));
    const replacementLinks = term.replacedBy
      .map((id) => `<a href="${relativeHref(4, canonicalTermPath(id))}">${escapeHtml(id)}</a>`)
      .join(", ");

    const html = page(
      `${term.id} - ${term.label}`,
      `
      <p class="breadcrumbs"><a href="../../../../index.html">Home</a> / <a href="../../index.html">Current release</a> / ${escapeHtml(term.id)}</p>
      <article class="grid">
        <section class="card">
          <div class="term-header">
            <div>
              <p class="kicker">Term Record</p>
              <h2>${escapeHtml(term.label || term.id)}</h2>
              <p class="term-id">${escapeHtml(term.id)}</p>
            </div>
            <div>
              <span class="pill">${escapeHtml(term.namespace || "sequence")}</span>
              ${term.isObsolete ? '<span class="pill obsolete">Obsolete term</span>' : ""}
            </div>
          </div>
          <p class="lede">${escapeHtml(term.definition.text || "No definition available in the current release.")}</p>
          ${
            term.definition.xrefs.length
              ? `<p><strong>Definition xrefs:</strong> ${term.definition.xrefs.map(escapeHtml).join(", ")}</p>`
              : ""
          }
          ${
            term.comments.length
              ? `<div><h3>Comments</h3>${term.comments.map((comment) => `<p>${escapeHtml(comment)}</p>`).join("")}</div>`
              : ""
          }
          ${
            term.isObsolete
              ? `<p><strong>Status:</strong> This term is marked obsolete in the current release.${replacementLinks ? ` Replacement guidance: ${replacementLinks}.` : ""}</p>`
              : ""
          }
        </section>

        <section class="grid two">
          <section class="card">
            <h3>Synonyms</h3>
            ${
              term.synonyms.length
                ? `<table><thead><tr><th scope="col">Scope</th><th scope="col">Value</th></tr></thead><tbody>${term.synonyms
                    .map((synonym) => `<tr><td>${escapeHtml(synonym.scope)}</td><td>${escapeHtml(synonym.value)}</td></tr>`)
                    .join("")}</tbody></table>`
                : '<p class="muted">No synonyms recorded in the OWL annotations.</p>'
            }
          </section>
          <section class="card">
            <h3>Identifiers and subsets</h3>
            <p><strong>Compact form:</strong> ${escapeHtml(term.compactId)}</p>
            <p><strong>IRI:</strong> <a href="${escapeHtml(term.iri)}">${escapeHtml(term.iri)}</a></p>
            <p><strong>Alternate IDs:</strong> ${term.altIds.length ? term.altIds.map(escapeHtml).join(", ") : "None"}</p>
            <p><strong>Subsets:</strong> ${term.subsets.length ? term.subsets.map(escapeHtml).join(", ") : "None"}</p>
            <p><strong>Cross references:</strong> ${term.xrefs.length ? term.xrefs.map(escapeHtml).join(", ") : "None"}</p>
          </section>
          <section class="card">
            <h3>Repository history</h3>
            <p class="muted">Prototype history is extracted from the SO-Ontologies git repository by following the term stanza in <code>so-edit.obo</code>.</p>
            <p><strong>First seen:</strong> ${
              term.history.firstSeen
                ? `${escapeHtml(term.history.firstSeen.date)} in commit ${escapeHtml(term.history.firstSeen.shortHash)}`
                : "No stanza history found in so-edit.obo"
            }</p>
            <p><strong>Most recent change:</strong> ${
              term.history.mostRecent
                ? `${escapeHtml(term.history.mostRecent.date)} in commit ${escapeHtml(term.history.mostRecent.shortHash)}`
                : "No recorded changes"
            }</p>
            ${
              term.history.entries.length
                ? `<table><thead><tr><th scope="col">Date</th><th scope="col">Commit</th><th scope="col">Summary</th></tr></thead><tbody>${term.history.entries
                    .map(
                      (entry) =>
                        `<tr><td>${escapeHtml(entry.date)}</td><td><code>${escapeHtml(entry.shortHash)}</code></td><td>${escapeHtml(entry.subject)}</td></tr>`
                    )
                    .join("")}</tbody></table>`
                : '<p class="muted">No term-specific git history is available for this term in the current editable file lineage.</p>'
            }
          </section>
        </section>

        <section class="card">
          <h3>Relationships</h3>
          <p class="muted">Text relationships are provided alongside the graph so the page remains understandable without visual interpretation.</p>
          <div class="relationship-grid">
            <section>
              <h4>Parents</h4>
              ${formatRelationList(parentIris, termsByIri)}
            </section>
            <section>
              <h4>Children</h4>
              ${formatRelationList(childIris, termsByIri)}
            </section>
          </div>
          ${
            grouped.length
              ? `<div class="relationship-grid">${grouped
                  .map(
                    ([predicate, targets]) => `<section><h4>${escapeHtml(predicate)}</h4>${formatRelationList(targets, termsByIri)}</section>`
                  )
                  .join("")}</div>`
              : ""
          }
        </section>

        <section class="card">
          <h3>Ontology DAG neighborhood</h3>
          <p class="muted">Informative diagram with linked parent, child, and related nodes. The surrounding text provides the same relationship content in accessible list form.</p>
          ${buildDagSvg(term, term.graphNeighborhood, termsByIri)}
        </section>
      </article>`,
      4
    );

    await writeFile(path.join(distDir, canonicalTermPath(term.id), "index.html"), html);

    const payload = {
      term,
      graph: {
        parents: parentIris.map((iri) => ({ iri, id: publicIdFromIri(iri), label: termsByIri.get(iri)?.label || publicIdFromIri(iri) })),
        children: childIris.map((iri) => ({ iri, id: publicIdFromIri(iri), label: termsByIri.get(iri)?.label || publicIdFromIri(iri) })),
        related: relatedIris.map((iri) => ({ iri, id: publicIdFromIri(iri), label: termsByIri.get(iri)?.label || publicIdFromIri(iri) }))
      }
    };
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
