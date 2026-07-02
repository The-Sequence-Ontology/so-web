import { canonicalTermPath, escapeHtml, relativeHref } from "./shared.mjs";

function formatRelationList(items, termByIri) {
  if (!items.length) {
    return '<p class="muted">None recorded in the current release neighborhood.</p>';
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

function formatHistoryType(type = "") {
  return type.replace(/_/g, " ");
}

function renderSemanticHistory(term) {
  const events = term.history.semanticEvents || [];
  if (!events.length) {
    return '<p class="muted">No semantic history events were extracted for this term from the current Git-era editable ontology history.</p>';
  }

  return `<div class="table-wrap"><table><thead><tr><th scope="col">Date</th><th scope="col">Change</th><th scope="col">Summary</th><th scope="col">Evidence</th></tr></thead><tbody>${events
    .map((event) => {
      const evidence = [`<code>${escapeHtml(event.shortHash)}</code>`];
      if (event.issueRefs?.length) {
        evidence.push(escapeHtml(event.issueRefs.join(", ")));
      }
      const details = event.details?.length
        ? `<div class="muted">${event.details.map((detail) => escapeHtml(detail)).join("<br />")}</div>`
        : "";
      return `<tr><td>${escapeHtml(event.date)}</td><td>${escapeHtml(formatHistoryType(event.type))}</td><td>${escapeHtml(event.summary)}${details}</td><td>${evidence.join("<br />")}</td></tr>`;
    })
    .join("")}</tbody></table></div>`;
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
  const minNodeWidth = 156;
  const horizontalGap = 28;
  const horizontalPadding = 44;
  const estimatedCharWidth = 9.25;

  function labelForIri(iri) {
    const target = termByIri.get(iri);
    return target ? target.label : iri;
  }

  function nodeWidthForIri(iri) {
    const target = termByIri.get(iri);
    if (!target) return minNodeWidth;
    const longestLine = Math.max(target.id.length, labelForIri(iri).length);
    return Math.max(minNodeWidth, Math.ceil(longestLine * estimatedCharWidth + horizontalPadding));
  }

  const rowWidths = rows.map((row) => row.items.map((iri) => nodeWidthForIri(iri)));
  const contentWidth = Math.max(
    minNodeWidth,
    ...rowWidths.map((widths) => widths.reduce((sum, width) => sum + width, 0) + horizontalGap * Math.max(0, widths.length - 1))
  );
  const svgWidth = Math.max(1120, contentWidth + 120);
  const centerX = svgWidth / 2;

  rows.forEach((row, rowIndex) => {
    const widths = rowWidths[rowIndex];
    const totalWidth = Math.max(widths.reduce((sum, width) => sum + width, 0) + horizontalGap * Math.max(0, row.items.length - 1), minNodeWidth);
    const startX = centerX - totalWidth / 2;
    let cursorX = startX;
    row.items.forEach((iri, index) => {
      const width = widths[index];
      nodes.push({ iri, x: cursorX, y: row.y, width, current: iri === term.iri });
      cursorX += width + horizontalGap;
    });
  });

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
  <svg class="dag-svg" viewBox="0 0 ${svgWidth} 470" role="img" aria-labelledby="dag-title-${term.compactId} dag-desc-${term.compactId}">
    <title id="dag-title-${term.compactId}">Ontology neighborhood for ${escapeHtml(term.id)}</title>
    <desc id="dag-desc-${term.compactId}">${escapeHtml(desc)}</desc>
    ${edges
      .map(([from, to]) => {
        const fromNode = nodeLookup.get(from);
        const toNode = nodeLookup.get(to);
        return `<line class="dag-edge" x1="${fromNode.x + fromNode.width / 2}" y1="${fromNode.y + 30}" x2="${toNode.x + toNode.width / 2}" y2="${toNode.y}" />`;
      })
      .join("")}
    ${nodes
      .map((node) => {
        const target = termByIri.get(node.iri);
        if (!target) return "";
        const label = labelForIri(node.iri);
        return `
      <a href="${relativeHref(4, canonicalTermPath(target.id))}" class="dag-node ${node.current ? "is-current" : ""}">
        <title>${escapeHtml(target.id)} ${escapeHtml(target.label)}</title>
        <rect x="${node.x}" y="${node.y}" width="${node.width}" height="58"></rect>
        <text x="${node.x + 14}" y="${node.y + 24}">${escapeHtml(target.id)}</text>
        <text x="${node.x + 14}" y="${node.y + 43}">${escapeHtml(label)}</text>
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

export { buildDagSvg, formatRelationList, groupRelationships, page, renderSemanticHistory };
