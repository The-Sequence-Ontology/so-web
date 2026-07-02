import { canonicalTermPath, escapeHtml, publicIdFromIri, relativeHref } from "./shared.mjs";
import { buildDagSvg, formatRelationList, groupRelationships, page, renderSemanticHistory } from "./render.mjs";

function renderTermPage(term, termsByIri, relatedMap, relatedIncomingMap = new Map()) {
  const parentIris = term.graphNeighborhood.parents;
  const childIris = term.graphNeighborhood.children;
  const groupedOutgoing = groupRelationships(
    (relatedMap.get(term.iri) || []).map((entry) => ({ predicate: entry.predicate, target: entry.target }))
  );
  const groupedIncoming = groupRelationships(
    (relatedIncomingMap.get(term.iri) || []).map((entry) => ({ predicate: entry.predicate, target: entry.source }))
  );
  const replacementLinks = term.replacedBy
    .map((id) => `<a href="${relativeHref(4, canonicalTermPath(id))}">${escapeHtml(id)}</a>`)
    .join(", ");

  return page(
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
          ${term.definition.xrefs.length ? `<p><strong>Definition xrefs:</strong> ${term.definition.xrefs.map(escapeHtml).join(", ")}</p>` : ""}
          ${term.comments.length ? `<div><h3>Comments</h3>${term.comments.map((comment) => `<p>${escapeHtml(comment)}</p>`).join("")}</div>` : ""}
          ${term.isObsolete ? `<p><strong>Status:</strong> This term is marked obsolete in the current release.${replacementLinks ? ` Replacement guidance: ${replacementLinks}.` : ""}</p>` : ""}
        </section>

        <section class="grid two">
          <section class="card">
            <h3>Synonyms</h3>
            ${term.synonyms.length
              ? `<table><thead><tr><th scope="col">Scope</th><th scope="col">Value</th></tr></thead><tbody>${term.synonyms
                  .map((synonym) => `<tr><td>${escapeHtml(synonym.scope)}</td><td>${escapeHtml(synonym.value)}</td></tr>`)
                  .join("")}</tbody></table>`
              : '<p class="muted">No synonyms recorded in the OWL annotations.</p>'}
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
            <h3>History summary</h3>
            <p class="muted">Best-effort semantic history is reconstructed from the Git-era editable ontology file by comparing term stanzas across revisions. This will miss earlier SVN-era changes until that history is added.</p>
            <p><strong>First seen in Git-era editable history:</strong> ${term.history.firstSeen ? `${escapeHtml(term.history.firstSeen.date)} in commit ${escapeHtml(term.history.firstSeen.shortHash)}` : "No stanza history found in so-edit.obo"}</p>
            <p><strong>Most recent Git-era change:</strong> ${term.history.mostRecent ? `${escapeHtml(term.history.mostRecent.date)} in commit ${escapeHtml(term.history.mostRecent.shortHash)}` : "No recorded changes"}</p>
            <p><strong>Extracted semantic events:</strong> ${escapeHtml(String((term.history.semanticEvents || []).length))}</p>
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
            groupedOutgoing.length
              ? `<div class="relationship-grid">${groupedOutgoing
                  .map(
                    ([predicate, targets]) =>
                      `<section><h4>${escapeHtml(predicate)} (outgoing)</h4>${formatRelationList(targets, termsByIri)}</section>`
                  )
                  .join("")}</div>`
              : ""
          }
          ${
            groupedIncoming.length
              ? `<div class="relationship-grid">${groupedIncoming
                  .map(
                    ([predicate, targets]) =>
                      `<section><h4>${escapeHtml(predicate)} (incoming)</h4>${formatRelationList(targets, termsByIri)}</section>`
                  )
                  .join("")}</div>`
              : ""
          }
        </section>

        <section class="card" data-graph-term="${escapeHtml(term.id)}" data-graph-src="../../../../assets/terms/${escapeHtml(term.id)}.json">
          <h3>Ontology DAG neighborhood</h3>
          <p class="muted">Informative diagram with linked parent, child, and related nodes. The surrounding text provides the same relationship content in accessible list form.</p>
          ${buildDagSvg(term, term.graphNeighborhood, termsByIri)}
        </section>
        <section class="card">
          <h3>Change history</h3>
          <p class="muted">This timeline is a best-effort semantic reconstruction from Git-era ontology revisions. It captures detected changes to labels, definitions, parents, synonyms, subsets, obsoletion state, and related stanza content.</p>
          ${renderSemanticHistory(term)}
        </section>
      </article>
      <script src="../../../../assets/graph.js" type="module"></script>`,
    4
  );
}

function renderHomePage({ metadata, metrics, rootHighlights }) {
  return page(
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
          ${rootHighlights.map((term) => `<li><a href="${canonicalTermPath(term.id)}">${escapeHtml(term.id)} - ${escapeHtml(term.label)}</a></li>`).join("")}
        </ul>
      </section>`,
    0
  );
}

function renderBrowsePage(activeTopLevelTerms) {
  return page(
    "Current Release Browse",
    `
      <p class="breadcrumbs"><a href="../../index.html">Home</a> / Current release</p>
      <section class="card">
        <h2>Browse the current release</h2>
        <p class="lede">This entry page links into representative top-level terms from the current release. Search remains the fastest path for most users.</p>
        <ul class="link-list">
          ${activeTopLevelTerms.map((term) => `<li><a href="term/${term.id}/">${escapeHtml(term.id)} - ${escapeHtml(term.label)}</a></li>`).join("")}
        </ul>
      </section>`,
    2
  );
}

function renderAboutPage() {
  return page(
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
  );
}

function renderReleasePage({ metadata, metrics }) {
  return page(
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
  );
}

function renderSearchPage() {
  return page(
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
  );
}

function buildTermPayload(term, termsByIri, metadata = {}) {
  const rolesByIri = new Map([[term.iri, new Set(["focal"])]]);

  function addRole(iri, role) {
    if (!rolesByIri.has(iri)) rolesByIri.set(iri, new Set());
    rolesByIri.get(iri).add(role);
  }

  for (const iri of term.graphNeighborhood.parents) addRole(iri, "parent");
  for (const iri of term.graphNeighborhood.children) addRole(iri, "child");
  for (const edge of term.graphNeighborhood.edges) {
    if (edge.predicate === "is_a") continue;
    if (edge.source === term.iri) addRole(edge.target, "related-outgoing");
    if (edge.target === term.iri) addRole(edge.source, "related-incoming");
  }

  const nodes = [...rolesByIri.entries()]
    .map(([iri, roles]) => {
      const node = termsByIri.get(iri);
      if (!node) return null;
      return {
        id: node.id,
        iri,
        label: node.label,
        url: `/${canonicalTermPath(node.id)}`,
        obsolete: node.isObsolete,
        roles: [...roles].sort()
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id));

  const edges = [
    ...new Map(
      term.graphNeighborhood.edges.map((edge) => [
        `${edge.source}|${edge.predicate}|${edge.target}`,
        {
          source: publicIdFromIri(edge.source),
          target: publicIdFromIri(edge.target),
          predicate: edge.predicate
        }
      ])
    ).values()
  ].sort((a, b) =>
    `${a.source}|${a.predicate}|${a.target}`.localeCompare(`${b.source}|${b.predicate}|${b.target}`)
  );

  return {
    schemaVersion: 1,
    release: {
      ontologyIri: metadata.ontologyIri || "",
      versionIri: metadata.versionIri || "",
      date: metadata.releaseDate || ""
    },
    focalTerm: term.id,
    nodes,
    edges
  };
}

export {
  buildTermPayload,
  renderAboutPage,
  renderBrowsePage,
  renderHomePage,
  renderReleasePage,
  renderSearchPage,
  renderTermPage
};
